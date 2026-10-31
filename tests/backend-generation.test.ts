import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Sandbox } from "@vercel/sandbox";
import { LocalFileStore } from "@/server/store";
import * as stores from "@/server/store";
import {
  addProposal,
  cancelGeneration,
  createGeneration,
  createShow,
  showKey,
  publicView,
  type ShowRecord,
} from "@/server/show";
import {
  runGeneration,
  captureSandboxCredentials,
  generationConfigured,
} from "@/server/generation";
import { GET as getStatus } from "@/app/api/status/route";
import { PRACTICE_RULE_SOURCE } from "@/game/rules";
const requestContextKey = Symbol.for("@vercel/request-context");
const fixtureOidc = () =>
  [
    Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url"),
    Buffer.from(
      JSON.stringify({
        owner_id: "team_fixture",
        project_id: "prj_fixture",
        exp: Math.floor(Date.now() / 1000) + 7200,
      }),
    ).toString("base64url"),
    "fixture-signature",
  ].join(".");
let directory: string;
let store: LocalFileStore;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "liveforge-races-"));
  store = new LocalFileStore(directory);
  vi.spyOn(stores, "getStore").mockReturnValue(store);
  vi.stubEnv("SESSION_SECRET", "test-generation-secret-123456789012345");
  vi.stubEnv("OPENAI_API_KEY", "fixture-provider-key");
  for (const name of [
    "VERCEL_TOKEN",
    "VERCEL_TEAM_ID",
    "VERCEL_PROJECT_ID",
    "VERCEL_OIDC_TOKEN_FILE",
  ])
    vi.stubEnv(name, "");
  vi.stubEnv("VERCEL_OIDC_TOKEN", fixtureOidc());
});
afterEach(async () => {
  delete (globalThis as Record<symbol, unknown>)[requestContextKey];
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await rm(directory, { recursive: true, force: true });
});
async function fixture() {
  const show = await createShow("host", "practice", store);
  const job = await store.update<
    ShowRecord,
    ReturnType<typeof createGeneration>
  >(showKey(show.id), (record) => {
    const proposal = addProposal(
      record,
      "A stationary prop casts a solid shadow after 24 ticks.",
      "Test inventor",
      "test-author",
      "practice",
    );
    return createGeneration(record, proposal.id);
  });
  return { show, job };
}
function delayedSandbox() {
  let signalStarted!: () => void, finish!: () => void;
  const started = new Promise<void>((resolve) => (signalStarted = resolve));
  const turn = new Promise<void>((resolve) => (finish = resolve));
  const stop = vi.fn().mockResolvedValue(undefined);
  const sandbox = {
    name: "unit-test-sandbox",
    stop,
    update: vi.fn().mockResolvedValue(undefined),
    writeFiles: vi.fn().mockResolvedValue(undefined),
    runCommand: vi.fn().mockImplementation(async ({ cmd }: { cmd: string }) => {
      if (cmd === "node") {
        signalStarted();
        await turn;
      }
      return { exitCode: 0 };
    }),
    readFileToBuffer: vi
      .fn()
      .mockImplementation(async ({ path }: { path: string }) =>
        Buffer.from(
          path.endsWith("rule.ts")
            ? PRACTICE_RULE_SOURCE
            : JSON.stringify(
                path.endsWith("thread.json")
                  ? { threadId: "fixture-sdk-thread" }
                  : {
                      threadId: "fixture-sdk-thread",
                      unsupportedReason: null,
                      usage: {
                        input_tokens: 100,
                        cached_input_tokens: 0,
                        output_tokens: 30,
                      },
                    },
              ),
        ),
      ),
  };
  vi.spyOn(Sandbox, "create").mockResolvedValue(
    sandbox as unknown as Awaited<ReturnType<typeof Sandbox.create>>,
  );
  return { started, finish, stop, sandbox };
}
describe("production Sandbox runtime OIDC", () => {
  it("recognizes trusted request-context OIDC without a static token environment variable", async () => {
    vi.stubEnv("VERCEL_OIDC_TOKEN", "");
    vi.stubEnv("VERCEL_TOKEN", "");
    vi.stubEnv("VERCEL", "1");
    const token = fixtureOidc();
    (globalThis as Record<symbol, unknown>)[requestContextKey] = {
      get: () => ({ headers: { "x-vercel-oidc-token": token } }),
    };
    expect(await generationConfigured()).toBe(true);
    const status = await getStatus(
      new Request("https://liveforge.example/api/status"),
    );
    const body = await status.json();
    expect(body.generation.configured).toBe(true);
    expect(JSON.stringify(body)).not.toContain(token);
    const credentials = await captureSandboxCredentials();
    expect(credentials).toEqual({
      token,
      teamId: "team_fixture",
      projectId: "prj_fixture",
    });
  });
  it("does not treat VERCEL=1 alone as a usable deployment identity", async () => {
    vi.stubEnv("VERCEL_OIDC_TOKEN", "");
    vi.stubEnv("VERCEL_OIDC_TOKEN_FILE", "");
    vi.stubEnv("VERCEL_TOKEN", "");
    vi.stubEnv("VERCEL", "1");
    expect(await generationConfigured()).toBe(false);
  });
  it("uses only captured invocation credentials after request context is gone and never persists them", async () => {
    vi.stubEnv("VERCEL_OIDC_TOKEN", "");
    vi.stubEnv("VERCEL_TOKEN", "");
    vi.stubEnv("VERCEL", "1");
    const token = fixtureOidc();
    (globalThis as Record<symbol, unknown>)[requestContextKey] = {
      get: () => ({ headers: { "x-vercel-oidc-token": token } }),
    };
    const credentials = await captureSandboxCredentials();
    delete (globalThis as Record<symbol, unknown>)[requestContextKey];
    expect(await generationConfigured()).toBe(false);
    const { show, job } = await fixture();
    const fake = delayedSandbox();
    const running = runGeneration(show.id, job.id, credentials);
    await fake.started;
    fake.finish();
    await running;
    expect(Sandbox.create).toHaveBeenCalledWith(
      expect.objectContaining(credentials),
    );
    const result = (await store.get<ShowRecord>(showKey(show.id)))!;
    expect(result.jobs[0].status).toBe("ready");
    expect(JSON.stringify(result)).not.toContain(token);
    expect(JSON.stringify(fake.sandbox.writeFiles.mock.calls)).not.toContain(
      token,
    );
    expect(JSON.stringify(fake.sandbox.runCommand.mock.calls)).not.toContain(
      token,
    );
  });
  it("resolves a fresh context token per request instead of caching deployment credentials", async () => {
    vi.stubEnv("VERCEL_OIDC_TOKEN", "");
    vi.stubEnv("VERCEL_TOKEN", "");
    let token = fixtureOidc();
    (globalThis as Record<symbol, unknown>)[requestContextKey] = {
      get: () => ({ headers: { "x-vercel-oidc-token": token } }),
    };
    const first = await captureSandboxCredentials();
    token = token.replace("fixture-signature", "rotated-fixture-signature");
    const second = await captureSandboxCredentials();
    expect(second.token).not.toBe(first.token);
  });
});
describe("durable generation races against late provider output", () => {
  it("denies network before reading any failed-run artifacts and keeps the redacted reason host-only", async () => {
    const { show, job } = await fixture();
    const fake = delayedSandbox();
    let modelComplete = false;
    let denied = false;
    fake.sandbox.update.mockImplementation(
      async (options: { networkPolicy: unknown }) => {
        if (modelComplete && options.networkPolicy === "deny-all")
          denied = true;
      },
    );
    fake.sandbox.runCommand.mockImplementation(
      async ({ cmd }: { cmd: string }) => {
        if (cmd === "node") {
          modelComplete = true;
          return { exitCode: 1 };
        }
        return { exitCode: 0 };
      },
    );
    fake.sandbox.readFileToBuffer.mockImplementation(
      async ({ path }: { path: string }) => {
        expect(denied).toBe(true);
        return Buffer.from(
          JSON.stringify(
            path.endsWith("failure.json")
              ? {
                  message:
                    "401 invalid fixture-provider-key; Bearer private-credential",
                }
              : { threadId: "failed-fixture-thread" },
          ),
        );
      },
    );
    await runGeneration(show.id, job.id);
    const final = (await store.get<ShowRecord>(showKey(show.id)))!;
    expect(final.jobs[0].status).toBe("failed");
    expect(final.jobs[0].message).toContain("401 invalid");
    expect(final.jobs[0].message).not.toMatch(
      /fixture-provider-key|private-credential/,
    );
    expect(JSON.stringify(publicView(final))).not.toContain("401 invalid");
    expect(final.candidates).toHaveLength(0);
    expect(final.activeCandidateId).toBeNull();
    expect(fake.stop).toHaveBeenCalledOnce();
  });

  it("cancellation wins even when a completed provider response arrives later", async () => {
    const { show, job } = await fixture();
    const fake = delayedSandbox();
    const running = runGeneration(show.id, job.id);
    await fake.started;
    await store.update<ShowRecord, void>(showKey(show.id), (record) => {
      cancelGeneration(record, job.id);
    });
    fake.finish();
    await running;
    const result = (await store.get<ShowRecord>(showKey(show.id)))!;
    expect(result.jobs[0].status).toBe("cancelled");
    expect(result.candidates).toHaveLength(0);
    expect(result.activeCandidateId).toBeNull();
    expect(fake.stop).toHaveBeenCalledOnce();
  });
  it("a newer game revision fences a completed generation from publishing a candidate", async () => {
    const { show, job } = await fixture();
    const fake = delayedSandbox();
    const running = runGeneration(show.id, job.id);
    await fake.started;
    await store.update<ShowRecord, void>(showKey(show.id), (record) => {
      record.revision++;
    });
    fake.finish();
    await running;
    const result = (await store.get<ShowRecord>(showKey(show.id)))!;
    expect(result.jobs[0].status).toBe("stale");
    expect(result.candidates).toHaveLength(0);
    expect(result.activeCandidateId).toBeNull();
    expect(fake.stop).toHaveBeenCalledOnce();
  });
  it("duplicate coordinators claim a queued job only once", async () => {
    const { show, job } = await fixture();
    const fake = delayedSandbox();
    const first = runGeneration(show.id, job.id);
    await fake.started;
    await runGeneration(show.id, job.id);
    expect(Sandbox.create).toHaveBeenCalledOnce();
    fake.finish();
    await first;
    const result = (await store.get<ShowRecord>(showKey(show.id)))!;
    expect(result.jobs[0].status).toBe("ready");
    expect(result.candidates).toHaveLength(1);
    expect(result.jobs[0].attemptEvidence?.[0].status).toBe("verified");
  });
});
