/** Server-only dependency image management. Never receives a model key, proposal or runner. */
import { createHash, randomUUID } from "node:crypto";
import { Sandbox, Snapshot, type Command } from "@vercel/sandbox";
import type { DocumentStore } from "./store";
import { getStore } from "./store";
import { HttpError } from "./errors";
export const SANDBOX_SDK_VERSION = "0.166.0";
export const SNAPSHOT_TTL_MS = 6 * 60 * 60 * 1000;
export type SandboxMode = "cold" | "snapshot";
export interface SandboxTimings {
  mode: SandboxMode;
  cacheHit: boolean;
  fallback: boolean;
  setupMs: number;
  createMs: number;
  installMs: number;
  snapshotMs: number;
}
export type TrustedGenerationPhase =
  "thread-started" | "turn-started" | "source-returned";
export interface SandboxAuthentication {
  token: string;
  teamId: string;
  projectId: string;
}
interface CacheRecord {
  snapshotId?: string;
  expiresAt?: number;
  lease?: { owner: string; expiresAt: number };
}
export interface SandboxProvider {
  create(options: Parameters<typeof Sandbox.create>[0]): Promise<Sandbox>;
  getSnapshot(
    options: SandboxAuthentication & { snapshotId: string },
  ): Promise<Pick<Snapshot, "status" | "expiresAt">>;
}
const provider: SandboxProvider = {
  create: (options) => Sandbox.create(options),
  getSnapshot: (options) => Snapshot.get(options),
};
const cleanCheck = `const fs=require('node:fs');const names=['input.json','runner.mjs','codex-home','rule.ts','result.json','thread.json','failure.json','.codex'];if(names.some(n=>fs.existsSync('/vercel/sandbox/'+n))||process.env.CODEX_API_KEY||process.env.OPENAI_API_KEY||fs.existsSync(require('node:os').homedir()+'/.codex'))process.exit(42);`;
const bounded = (n: number) => Math.max(0, Math.min(300000, Math.round(n)));
const cacheKey = (projectId: string) =>
  "sdk-image:" +
  createHash("sha256")
    .update(`${projectId}:node24:${SANDBOX_SDK_VERSION}:dependencies-only-v1`)
    .digest("hex");
export function sandboxMode(value: unknown): SandboxMode {
  if (value === undefined || value === "snapshot") return "snapshot";
  if (value === "cold") return "cold";
  throw new Error("Sandbox mode must be cold or snapshot");
}
/** Call only after the trusted coordinator has atomically claimed an authorized queued job. */
export async function createGenerationSandbox(options: {
  credentials: SandboxAuthentication;
  showId: string;
  jobId: string;
  mode?: SandboxMode;
  deadlineAt?: number;
  store?: DocumentStore;
  provider?: SandboxProvider;
}): Promise<{ sandbox: Sandbox; timings: SandboxTimings }> {
  const start = Date.now(),
    store = options.store ?? getStore(),
    api = options.provider ?? provider,
    mode = sandboxMode(options.mode),
    credentials = { ...options.credentials };
  const show = await store.get<{ jobs: { id: string; status: string }[] }>(
    "show:" + options.showId,
  );
  if (
    !show?.jobs.some((j) => j.id === options.jobId && j.status === "starting")
  )
    throw new HttpError(
      409,
      "job_not_claimed",
      "Only a claimed generation job may prepare its dependency runtime.",
    );
  const timings: SandboxTimings = {
    mode,
    cacheHit: false,
    fallback: false,
    setupMs: 0,
    createMs: 0,
    installMs: 0,
    snapshotMs: 0,
  };
  const key = cacheKey(credentials.projectId),
    owner = randomUUID();
  const create = async (snapshotId?: string) => {
    const t = Date.now(),
      remaining = (options.deadlineAt ?? start + 260000) - Date.now();
    if (remaining <= 0) throw new Error("Generation setup deadline expired");
    try {
      return await api.create({
        ...credentials,
        ...(snapshotId
          ? { source: { type: "snapshot" as const, snapshotId } }
          : { runtime: "node24" }),
        persistent: false,
        env: {},
        timeout: Math.min(260000, remaining),
        resources: { vcpus: 2 },
        networkPolicy: {
          allow: snapshotId ? ["api.openai.com"] : ["registry.npmjs.org"],
        },
        tags: {
          application: "liveforge",
          purpose: snapshotId ? "generation" : "sdk-setup",
        },
        signal: AbortSignal.timeout(Math.max(1, Math.min(25000, remaining))),
      });
    } finally {
      timings.createMs += bounded(Date.now() - t);
    }
  };
  const install = async (vm: Sandbox) => {
    const t = Date.now();
    try {
      const result = await vm.runCommand({
        cmd: "npm",
        args: [
          "install",
          "--no-audit",
          "--no-fund",
          "--ignore-scripts",
          `@openai/codex-sdk@${SANDBOX_SDK_VERSION}`,
        ],
        cwd: "/vercel/sandbox",
        timeoutMs: 60000,
      });
      if (result.exitCode !== 0)
        throw new Error("Pinned SDK installation failed");
    } finally {
      timings.installMs += bounded(Date.now() - t);
    }
  };
  const assertClean = async (vm: Sandbox) => {
    const result = await vm.runCommand({
      cmd: "node",
      args: ["-e", cleanCheck],
      cwd: "/vercel/sandbox",
      timeoutMs: 5000,
    });
    if (result.exitCode !== 0)
      throw new Error("Dependency image contains generation state");
  };
  const cold = async () => {
    const vm = await create();
    try {
      await install(vm);
      await vm.update({ networkPolicy: "deny-all" });
      await assertClean(vm);
      await vm.update({ networkPolicy: { allow: ["api.openai.com"] } });
      return vm;
    } catch (error) {
      await vm.stop().catch(() => undefined);
      throw error;
    }
  };
  if (mode === "cold") {
    const vm = await cold();
    timings.setupMs = bounded(Date.now() - start);
    return { sandbox: vm, timings };
  }
  await store.create<CacheRecord>(key, {});
  const invalidate = async (id: string) =>
    store.update<CacheRecord, void>(key, (r) => {
      if (r.snapshotId === id) {
        delete r.snapshotId;
        delete r.expiresAt;
      }
    });
  let prepared = false;
  for (let attempt = 0; attempt < 2; attempt++) {
    let record = await store.get<CacheRecord>(key);
    if (record?.snapshotId && record.expiresAt! > Date.now() + 30000) {
      const id = record.snapshotId;
      try {
        const image = await api.getSnapshot({ ...credentials, snapshotId: id });
        if (
          image.status !== "created" ||
          !image.expiresAt ||
          image.expiresAt.getTime() <= Date.now() + 30000
        )
          throw new Error("Snapshot unavailable");
        const vm = await create(id);
        try {
          await assertClean(vm);
        } catch (error) {
          await vm.stop().catch(() => undefined);
          throw error;
        }
        timings.cacheHit = !prepared;
        timings.setupMs = bounded(Date.now() - start);
        return { sandbox: vm, timings };
      } catch {
        timings.fallback = true;
        await invalidate(id);
      }
    }
    if (prepared) break;
    const claimed = await store.update<CacheRecord, boolean>(key, (r) => {
      if (r.snapshotId && r.expiresAt! > Date.now() + 30000) return false;
      if (r.lease && r.lease.expiresAt > Date.now()) return false;
      r.lease = { owner, expiresAt: Date.now() + 120000 };
      return true;
    });
    if (!claimed) {
      break;
    } // A competing authorized job prepares once; this job takes bounded cold fallback.
    prepared = true;
    let vm: Sandbox | undefined,
      captured = false;
    try {
      vm = await create();
      await install(vm);
      await vm.update({ networkPolicy: "deny-all" });
      await assertClean(vm);
      const t = Date.now();
      let image: Snapshot;
      try {
        image = await vm.snapshot({
          expiration: SNAPSHOT_TTL_MS,
          signal: AbortSignal.timeout(20000),
        });
        captured = true;
      } finally {
        timings.snapshotMs += bounded(Date.now() - t);
      }
      if (image.status !== "created" || !image.expiresAt)
        throw new Error("Dependency snapshot did not become ready");
      const saved = await store.update<CacheRecord, boolean>(key, (r) => {
        if (r.lease?.owner !== owner) return false;
        r.snapshotId = image.snapshotId;
        r.expiresAt = Math.min(
          image.expiresAt!.getTime(),
          Date.now() + SNAPSHOT_TTL_MS,
        );
        delete r.lease;
        return true;
      });
      if (!saved) {
        await image.delete().catch(() => undefined);
        break;
      }
    } catch {
      timings.fallback = true;
      await store.update<CacheRecord, void>(key, (r) => {
        if (r.lease?.owner === owner) delete r.lease;
      });
      break;
    } finally {
      if (vm && !captured) await vm.stop().catch(() => undefined);
    }
  }
  timings.fallback = true;
  const vm = await cold();
  timings.setupMs = bounded(Date.now() - start);
  return { sandbox: vm, timings };
}
const PHASES = new Set<TrustedGenerationPhase>([
  "thread-started",
  "turn-started",
  "source-returned",
]);
/** Decode only allowlisted markers printed by our trusted runner, never arbitrary SDK/model text. */
export function parseTrustedPhase(line: string): TrustedGenerationPhase | null {
  if (line.length > 256 || !line.startsWith("LIVEFORGE_PHASE ")) return null;
  try {
    const v = JSON.parse(line.slice(16));
    return v && Object.keys(v).length === 1 && PHASES.has(v.phase)
      ? v.phase
      : null;
  } catch {
    return null;
  }
}
export async function waitWithTrustedProgress(
  command: Pick<Command, "logs" | "wait">,
  onPhase: (phase: TrustedGenerationPhase) => Promise<void>,
  timeoutMs = 70000,
) {
  const controller = new AbortController(),
    seen = new Set<TrustedGenerationPhase>();
  let bytes = 0,
    buffer = "";
  let logError: unknown;
  const logs = command.logs({ signal: controller.signal });
  const reader = (async () => {
    try {
      for await (const entry of logs) {
        if (entry.stream !== "stdout") continue;
        bytes += entry.data.length;
        if (bytes > 16384) {
          controller.abort();
          break;
        }
        buffer += entry.data;
        if (buffer.length > 512 && !buffer.includes("\n")) {
          buffer = "";
          continue;
        }
        const direct = parseTrustedPhase(buffer);
        if (direct) {
          buffer = "";
          if (!seen.has(direct)) {
            seen.add(direct);
            await onPhase(direct);
          }
          continue;
        }
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const phase = parseTrustedPhase(line);
          if (phase && !seen.has(phase)) {
            seen.add(phase);
            await onPhase(phase);
          }
        }
      }
      const finalPhase = parseTrustedPhase(buffer);
      if (finalPhase && !seen.has(finalPhase)) {
        seen.add(finalPhase);
        await onPhase(finalPhase);
      }
    } catch (error) {
      if (!controller.signal.aborted) logError = error;
    }
  })();
  try {
    const result = await command.wait({
      signal: AbortSignal.timeout(timeoutMs),
    });
    await Promise.race([
      reader,
      new Promise<void>((resolve) => setTimeout(resolve, 200)),
    ]);
    if (logError) throw logError;
    return result;
  } finally {
    controller.abort();
    logs.close();
    await reader;
  }
}
