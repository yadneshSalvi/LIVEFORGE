import { describe, it, expect, vi } from "vitest";
import type { Sandbox, Command } from "@vercel/sandbox";
import type { DocumentStore } from "../src/server/store";
import {
  createGenerationSandbox,
  parseTrustedPhase,
  waitWithTrustedProgress,
  SNAPSHOT_TTL_MS,
  type SandboxProvider,
} from "../src/server/sandbox-runtime";
import {
  parseEvaluationOptions,
  parseEvaluationCases,
  evaluate,
} from "../scripts/generation-evaluate";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
class MemoryStore implements DocumentStore {
  records = new Map<string, unknown>([
    [
      "show:show",
      {
        jobs: [
          { id: "one", status: "starting" },
          { id: "two", status: "starting" },
        ],
      },
    ],
  ]);
  async get<T>(key: string) {
    return structuredClone(this.records.get(key) ?? null) as T | null;
  }
  async create<T>(key: string, value: T) {
    if (this.records.has(key)) return false;
    this.records.set(key, structuredClone(value));
    return true;
  }
  async update<T, R>(key: string, change: (value: T) => R) {
    const value = structuredClone(this.records.get(key)) as T;
    const result = change(value);
    this.records.set(key, value);
    return result;
  }
}
function fixture() {
  const trace: { vm: number; op: string; value: unknown }[] = [],
    created: unknown[] = [],
    images = new Map<
      string,
      { status: "created" | "deleted"; expiresAt: Date }
    >();
  let snapshots = 0;
  let installHook: ((vm: number) => Promise<void>) | undefined;
  const api: SandboxProvider = {
    create: async (options) => {
      const vm = created.length;
      created.push(options);
      trace.push({ vm, op: "create", value: options });
      return {
        name: `vm-${vm}`,
        runCommand: async (command: { cmd: string; args: string[] }) => {
          trace.push({ vm, op: "command", value: command });
          if (command.cmd === "npm") await installHook?.(vm);
          return { exitCode: 0 };
        },
        update: async (value: unknown) => {
          trace.push({ vm, op: "update", value });
        },
        stop: async () => {
          trace.push({ vm, op: "stop", value: null });
        },
        snapshot: async (options: { expiration?: number }) => {
          snapshots++;
          trace.push({ vm, op: "snapshot", value: options });
          const snapshotId = `private-snapshot-${snapshots}`,
            expiresAt = new Date(Date.now() + SNAPSHOT_TTL_MS);
          images.set(snapshotId, { status: "created", expiresAt });
          return {
            snapshotId,
            status: "created",
            expiresAt,
            delete: async () => {
              images.delete(snapshotId);
            },
          };
        },
      } as unknown as Sandbox;
    },
    getSnapshot: async ({ snapshotId }) => {
      const image = images.get(snapshotId);
      if (!image) throw new Error("missing");
      return image;
    },
  };
  const store = new MemoryStore(),
    credentials = {
      token: "synthetic-auth",
      teamId: "test-team",
      projectId: "test-project",
    };
  const run = (
    jobId = "one",
    mode?: "cold" | "snapshot",
    deadlineAt?: number,
  ) =>
    createGenerationSandbox({
      store,
      provider: api,
      credentials,
      showId: "show",
      jobId,
      mode,
      deadlineAt,
    });
  return {
    trace,
    created,
    images,
    store,
    run,
    setInstallHook: (hook: typeof installHook) => {
      installHook = hook;
    },
    snapshots: () => snapshots,
  };
}
describe("dependency-only sandbox image lifecycle (mocked SDK, no billable calls)", () => {
  it("installs only dependencies before deny-all, clean audit and finite-expiry snapshot", async () => {
    const f = fixture(),
      result = await f.run();
    expect(f.snapshots()).toBe(1);
    expect(f.created).toHaveLength(2);
    const prep = f.created[0] as Record<string, unknown>,
      job = f.created[1] as Record<string, unknown>;
    expect(prep).toMatchObject({
      runtime: "node24",
      persistent: false,
      env: {},
      networkPolicy: { allow: ["registry.npmjs.org"] },
    });
    expect(job).toMatchObject({
      source: { type: "snapshot", snapshotId: "private-snapshot-1" },
      persistent: false,
      env: {},
      networkPolicy: { allow: ["api.openai.com"] },
    });
    expect(job).not.toHaveProperty("runtime");
    const operations = f.trace.filter((x) => x.vm === 0);
    expect(operations.map((x) => x.op)).toEqual([
      "create",
      "command",
      "update",
      "command",
      "snapshot",
    ]);
    expect(operations[1].value).toMatchObject({
      cmd: "npm",
      args: expect.arrayContaining([
        "--ignore-scripts",
        "@openai/codex-sdk@0.166.0",
      ]),
    });
    expect(operations[2].value).toEqual({ networkPolicy: "deny-all" });
    expect(operations[4].value).toMatchObject({ expiration: SNAPSHOT_TTL_MS });
    expect(JSON.stringify(f.trace)).not.toContain("OPENAI_API_KEY=synthetic");
    expect(result.timings.cacheHit).toBe(false);
    expect(JSON.stringify(result.timings)).not.toContain("private-snapshot");
  });
  it("reuses the durable clean image without reinstalling or snapshotting a generation VM", async () => {
    const f = fixture();
    await f.run();
    const warm = await f.run("two");
    expect(warm.timings.cacheHit).toBe(true);
    expect(f.snapshots()).toBe(1);
    expect(
      f.trace.filter(
        (x) => x.op === "command" && (x.value as { cmd: string }).cmd === "npm",
      ),
    ).toHaveLength(1);
    expect(
      f.trace.filter((x) => x.op === "snapshot").every((x) => x.vm === 0),
    ).toBe(true);
  });
  it("forces cold without reading or creating a snapshot record", async () => {
    const f = fixture(),
      result = await f.run("one", "cold");
    expect(f.created).toHaveLength(1);
    expect(f.snapshots()).toBe(0);
    expect(f.store.records.size).toBe(1);
    expect(result.timings).toMatchObject({
      mode: "cold",
      cacheHit: false,
      fallback: false,
    });
  });
  it("rebuilds an expired/deleted snapshot once and records bounded fallback", async () => {
    const f = fixture();
    await f.run();
    f.images.get("private-snapshot-1")!.status = "deleted";
    const rebuilt = await f.run("two");
    expect(f.snapshots()).toBe(2);
    expect(rebuilt.timings.fallback).toBe(true);
    expect(rebuilt.timings.cacheHit).toBe(false);
  });
  it("uses one preparation lease under concurrent jobs, with a cold fallback for the contender", async () => {
    const f = fixture();
    let release!: () => void, entered!: () => void;
    const gate = new Promise<void>((r) => (release = r)),
      started = new Promise<void>((r) => (entered = r));
    f.setInstallHook(async (vm) => {
      if (vm === 0) {
        entered();
        await gate;
      }
    });
    const first = f.run();
    await started;
    const second = await f.run("two");
    expect(second.timings.fallback).toBe(true);
    release();
    await first;
    expect(f.snapshots()).toBe(1);
  });
  it("does no setup for an unclaimed job and rejects invalid server-only mode", async () => {
    const f = fixture();
    await expect(f.run("unknown")).rejects.toThrow(/claimed/);
    expect(f.created).toHaveLength(0);
    await expect(f.run("one", "cold", Date.now() - 1)).rejects.toThrow(
      /deadline/,
    );
    expect(f.created).toHaveLength(0);
    await expect(f.run("one", "body-override" as "cold")).rejects.toThrow(
      /mode/,
    );
  });
});
describe("trusted phase marker streaming", () => {
  it("accepts only allowlisted minimal markers and never model/reasoning text", () => {
    expect(parseTrustedPhase('LIVEFORGE_PHASE {"phase":"turn-started"}')).toBe(
      "turn-started",
    );
    for (const value of [
      '{"phase":"turn-started"}',
      'LIVEFORGE_PHASE {"phase":"reasoning"}',
      'LIVEFORGE_PHASE {"phase":"turn-started","text":"secret"}',
      "model says hello",
    ])
      expect(parseTrustedPhase(value)).toBeNull();
  });
  it("streams bounded fragmented stdout markers while waiting, deduplicates and closes", async () => {
    const phases: string[] = [],
      close = vi.fn();
    const iterator = (async function* () {
      yield {
        stream: "stdout",
        data: 'arbitrary SDK text\nLIVEFORGE_PHASE {"phase":"thread-',
      };
      yield {
        stream: "stdout",
        data: 'started"}\nLIVEFORGE_PHASE {"phase":"turn-started"}\n',
      };
      yield {
        stream: "stderr",
        data: 'LIVEFORGE_PHASE {"phase":"source-returned"}\n',
      };
      yield {
        stream: "stdout",
        data: 'LIVEFORGE_PHASE {"phase":"turn-started"}\nLIVEFORGE_PHASE {"phase":"source-returned"}',
      };
    })();
    Object.assign(iterator, { close });
    const wait = vi.fn(async () => ({ exitCode: 0 }));
    const command = { logs: () => iterator, wait } as unknown as Pick<
      Command,
      "logs" | "wait"
    >;
    const result = await waitWithTrustedProgress(command, async (phase) => {
      phases.push(phase);
    });
    expect(result.exitCode).toBe(0);
    expect(phases).toEqual([
      "thread-started",
      "turn-started",
      "source-returned",
    ]);
    expect(wait.mock.calls).toHaveLength(1);
    expect(close).toHaveBeenCalled();
  });
});
describe("evaluation harness is explicit, nonoverwriting and original-case only", () => {
  it("accepts frozen root case shape and server-only cold/snapshot flags", () => {
    expect(
      parseEvaluationCases({
        proposals: [
          { id: "E01", text: "Moon gravity please", category: "gravity" },
        ],
      }),
    ).toEqual([
      {
        id: "E01",
        proposal: "Moon gravity please",
        heldOut: false,
        category: "gravity",
      },
    ]);
    expect(
      parseEvaluationOptions([
        "--cases-file",
        "frozen.json",
        "--output-dir",
        "fresh",
        "--sandbox-mode",
        "cold",
      ]),
    ).toMatchObject({ sandboxMode: "cold", help: false });
    expect(() => parseEvaluationOptions(["--api-body", "snapshot"])).toThrow();
    expect(() =>
      parseEvaluationOptions(["--sandbox-mode", "unknown"]),
    ).toThrow();
    expect(() =>
      parseEvaluationCases({
        proposals: [{ id: "../overwrite", text: "Invalid id" }],
      }),
    ).toThrow();
  });
  it("fails on an existing output directory before creating any job or provider call", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "liveforge-eval-"));
    try {
      await expect(
        evaluate({ outputDir: dir, sandboxMode: "cold", help: false }),
      ).rejects.toMatchObject({ code: "EEXIST" });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
