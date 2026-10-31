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
  type ShowRecord,
} from "@/server/show";
import { runGeneration } from "@/server/generation";
import { PRACTICE_RULE_SOURCE } from "@/game/rules";
let directory: string;
let store: LocalFileStore;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "liveforge-races-"));
  store = new LocalFileStore(directory);
  vi.spyOn(stores, "getStore").mockReturnValue(store);
  vi.stubEnv("SESSION_SECRET", "test-generation-secret-123456789012345");
  vi.stubEnv("OPENAI_API_KEY", "fixture-provider-key");
  vi.stubEnv("VERCEL_OIDC_TOKEN", "fixture-oidc");
});
afterEach(async () => {
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
describe("durable generation races against late provider output", () => {
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
