/** Server-only dependency image management. Never receives a model key, proposal or runner. */
import { createHash, randomUUID } from "node:crypto";
import { Sandbox, Snapshot, type Command } from "@vercel/sandbox";
import type { DocumentStore } from "./store";
import { getStore } from "./store";
import { HttpError } from "./errors";
import type { SandboxFailureDiagnostic } from "./contracts";
export const SANDBOX_SDK_VERSION = "0.166.0";
/** Vercel's minimum provider retention; independent from the shorter application reuse window. */
export const SNAPSHOT_TTL_MS = 24 * 60 * 60 * 1000;
export const SNAPSHOT_REUSE_MS = 6 * 60 * 60 * 1000;
export type SandboxMode = "cold" | "snapshot";
export interface SandboxTimings {
  mode: SandboxMode;
  cacheHit: boolean;
  fallback: boolean;
  setupMs: number;
  createMs: number;
  installMs: number;
  snapshotMs: number;
  failures?: SandboxFailureDiagnostic[];
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
  /** Local reuse cutoff, never extended when a provider snapshot is reused. */
  expiresAt?: number;
  lease?: { owner: string; expiresAt: number };
}
export interface SandboxProvider {
  create(options: Parameters<typeof Sandbox.create>[0]): Promise<Sandbox>;
  getSnapshot(
    options: SandboxAuthentication & {
      snapshotId: string;
      signal?: AbortSignal;
    },
  ): Promise<Pick<Snapshot, "status" | "expiresAt">>;
}
const provider: SandboxProvider = {
  create: (options) => Sandbox.create(options),
  getSnapshot: (options) => Snapshot.get(options),
};
class SetupFailure extends Error {
  constructor(readonly category: SandboxFailureDiagnostic["category"]) {
    super(category);
  }
}
/** Fixed enums plus a numeric status. Never copy SDK text, response bodies, credentials or identifiers. */
export function snapshotFailureDiagnostic(
  stage: SandboxFailureDiagnostic["stage"],
  error: unknown,
): SandboxFailureDiagnostic {
  const value =
    error && typeof error === "object"
      ? (error as {
          status?: unknown;
          response?: { status?: unknown };
          name?: unknown;
          code?: unknown;
        })
      : undefined;
  const status = value?.response?.status ?? value?.status;
  const httpStatus =
    typeof status === "number" &&
    Number.isInteger(status) &&
    status >= 100 &&
    status <= 599
      ? status
      : undefined;
  const category: SandboxFailureDiagnostic["category"] =
    error instanceof SetupFailure
      ? error.category
      : value?.name === "TimeoutError" ||
          value?.name === "AbortError" ||
          value?.code === "ETIMEDOUT"
        ? "timeout"
        : httpStatus !== undefined
          ? "http-error"
          : ["ECONNRESET", "ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN"].includes(
                String(value?.code),
              )
            ? "network-error"
            : stage === "cache-publish" || stage === "cache-lease"
              ? "store-error"
              : "unknown";
  return {
    stage,
    category,
    ...(httpStatus !== undefined ? { httpStatus } : {}),
  };
}
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
    deadlineAt = options.deadlineAt ?? start + 260000,
    store = options.store ?? getStore(),
    api = options.provider ?? provider,
    mode = sandboxMode(options.mode),
    credentials = { ...options.credentials };
  function remaining() {
    return deadlineAt - Date.now();
  }
  function operationSignal(limit: number) {
    if (remaining() <= 0)
      throw new HttpError(
        503,
        "generation_deadline",
        "The bounded generation setup deadline expired; the active game is preserved.",
      );
    return AbortSignal.timeout(Math.max(1, Math.min(limit, remaining())));
  }
  async function requireStarting() {
    operationSignal(5000);
    const show = await untilAborted(
      store.get<{ jobs: { id: string; status: string }[] }>(
        "show:" + options.showId,
      ),
      operationSignal(5000),
    );
    if (
      !show?.jobs.some((j) => j.id === options.jobId && j.status === "starting")
    )
      throw new HttpError(
        409,
        "job_not_claimed",
        "Only a current claimed generation job may prepare its dependency runtime.",
      );
    operationSignal(5000);
  }
  await requireStarting();
  const timings: SandboxTimings = {
    mode,
    cacheHit: false,
    fallback: false,
    setupMs: 0,
    createMs: 0,
    installMs: 0,
    snapshotMs: 0,
  };
  const recordFailure = (
    stage: SandboxFailureDiagnostic["stage"],
    error: unknown,
  ) => {
    timings.failures ??= [];
    if (timings.failures.length < 4)
      timings.failures.push(snapshotFailureDiagnostic(stage, error));
  };
  const terminal = (error: unknown) =>
    error instanceof HttpError &&
    ["job_not_claimed", "generation_deadline"].includes(error.code);
  async function stop(vm: Sandbox) {
    await vm.stop({ signal: AbortSignal.timeout(5000) }).catch(() => undefined);
  }
  const key = cacheKey(credentials.projectId),
    owner = randomUUID();
  const create = async (snapshotId?: string) => {
    await requireStarting();
    const t = Date.now();
    try {
      const vm = await api.create({
        ...credentials,
        ...(snapshotId
          ? { source: { type: "snapshot" as const, snapshotId } }
          : { runtime: "node24" }),
        persistent: false,
        env: {},
        timeout: Math.min(260000, remaining()),
        resources: { vcpus: 2 },
        networkPolicy: {
          allow: snapshotId ? ["api.openai.com"] : ["registry.npmjs.org"],
        },
        tags: {
          application: "liveforge",
          purpose: snapshotId ? "generation" : "sdk-setup",
        },
        signal: operationSignal(25000),
      });
      try {
        await requireStarting();
        return vm;
      } catch (error) {
        await stop(vm);
        throw error;
      }
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
        timeoutMs: Math.min(60000, remaining()),
        signal: operationSignal(60000),
      });
      if (result.exitCode !== 0) throw new SetupFailure("command-failed");
    } finally {
      timings.installMs += bounded(Date.now() - t);
    }
  };
  const audit = async (vm: Sandbox) => {
    const result = await vm.runCommand({
      cmd: "node",
      args: ["-e", cleanCheck],
      cwd: "/vercel/sandbox",
      timeoutMs: Math.min(5000, remaining()),
      signal: operationSignal(5000),
    });
    if (result.exitCode !== 0) throw new SetupFailure("dirty-image");
  };
  const network = async (
    vm: Sandbox,
    policy: Parameters<Sandbox["update"]>[0]["networkPolicy"],
  ) => vm.update({ networkPolicy: policy }, { signal: operationSignal(5000) });
  const cold = async () => {
    const vm = await create();
    try {
      await install(vm);
      await requireStarting();
      await network(vm, "deny-all");
      await audit(vm);
      await network(vm, { allow: ["api.openai.com"] });
      await requireStarting();
      return vm;
    } catch (error) {
      await stop(vm);
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
    await requireStarting();
    const record = await store.get<CacheRecord>(key);
    if (record?.snapshotId && record.expiresAt! > Date.now() + 30000) {
      const id = record.snapshotId;
      let stage: SandboxFailureDiagnostic["stage"] = "snapshot-lookup";
      try {
        const image = await api.getSnapshot({
          ...credentials,
          snapshotId: id,
          signal: operationSignal(10000),
        });
        stage = "snapshot-validation";
        if (
          image.status !== "created" ||
          !image.expiresAt ||
          !Number.isFinite(image.expiresAt.getTime()) ||
          image.expiresAt.getTime() <= Date.now() + 30000
        )
          throw new SetupFailure("invalid-image");
        stage = "vm-create";
        const vm = await create(id);
        try {
          stage = "clean-audit";
          await audit(vm);
          await requireStarting();
        } catch (error) {
          await stop(vm);
          throw error;
        }
        timings.cacheHit = !prepared;
        timings.setupMs = bounded(Date.now() - start);
        return { sandbox: vm, timings };
      } catch (error) {
        if (terminal(error)) throw error;
        timings.fallback = true;
        recordFailure(stage, error);
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
      recordFailure("cache-lease", new SetupFailure("lease-busy"));
      break;
    }
    prepared = true;
    let vm: Sandbox | undefined,
      captured = false;
    let stage: SandboxFailureDiagnostic["stage"] = "vm-create";
    try {
      vm = await create();
      stage = "dependency-install";
      await install(vm);
      await requireStarting();
      stage = "network-policy";
      await network(vm, "deny-all");
      stage = "clean-audit";
      await audit(vm);
      await requireStarting();
      const t = Date.now();
      let image: Snapshot;
      try {
        stage = "snapshot-capture";
        image = await vm.snapshot({
          expiration: SNAPSHOT_TTL_MS,
          signal: operationSignal(20000),
        });
        captured = true;
      } finally {
        timings.snapshotMs += bounded(Date.now() - t);
      }
      stage = "snapshot-validation";
      if (
        image.status !== "created" ||
        !image.expiresAt ||
        !Number.isFinite(image.expiresAt.getTime()) ||
        image.expiresAt.getTime() <= Date.now() + 30000
      )
        throw new SetupFailure("invalid-image");
      stage = "cache-publish";
      const saved = await store.update<CacheRecord, boolean>(key, (r) => {
        if (r.lease?.owner !== owner || r.lease.expiresAt <= Date.now())
          return false;
        r.snapshotId = image.snapshotId;
        r.expiresAt = Math.min(
          image.expiresAt!.getTime(),
          Date.now() + SNAPSHOT_REUSE_MS,
        );
        delete r.lease;
        return true;
      });
      if (!saved) {
        recordFailure("cache-publish", new SetupFailure("lease-lost"));
        await image
          .delete({ signal: AbortSignal.timeout(5000) })
          .catch(() => undefined);
        break;
      }
    } catch (error) {
      await store.update<CacheRecord, void>(key, (r) => {
        if (r.lease?.owner === owner) delete r.lease;
      });
      if (terminal(error)) throw error;
      timings.fallback = true;
      recordFailure(stage, error);
      break;
    } finally {
      if (vm && !captured) await stop(vm);
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
/** Observing progress must never prevent the caller from stopping a VM. The underlying store write may finish later. */
function untilAborted<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => {
      cleanup();
      reject(signal.reason);
    };
    const cleanup = () => signal.removeEventListener("abort", abort);
    promise.then(
      (value) => {
        cleanup();
        resolve(value);
      },
      (error) => {
        cleanup();
        reject(error);
      },
    );
    if (signal.aborted) abort();
    else signal.addEventListener("abort", abort, { once: true });
  });
}
export async function waitWithTrustedProgress(
  command: Pick<Command, "logs" | "wait">,
  onPhase: (
    phase: TrustedGenerationPhase,
    signal: AbortSignal,
  ) => Promise<void>,
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
            await untilAborted(
              onPhase(direct, controller.signal),
              controller.signal,
            );
          }
          continue;
        }
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const phase = parseTrustedPhase(line);
          if (phase && !seen.has(phase)) {
            seen.add(phase);
            await untilAborted(
              onPhase(phase, controller.signal),
              controller.signal,
            );
          }
        }
      }
      const finalPhase = parseTrustedPhase(buffer);
      if (finalPhase && !seen.has(finalPhase)) {
        seen.add(finalPhase);
        await untilAborted(
          onPhase(finalPhase, controller.signal),
          controller.signal,
        );
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
    // Native close aborts the stream. A non-cooperative observer must not hold VM cleanup.
    await untilAborted(reader, AbortSignal.timeout(50)).catch(() => undefined);
  }
}
