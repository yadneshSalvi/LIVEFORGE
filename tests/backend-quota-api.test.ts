import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("next/server", () => ({ after: vi.fn() }));
import { after } from "next/server";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { LocalFileStore } from "@/server/store";
import * as stores from "@/server/store";
import { createShow, showKey, type ShowRecord } from "@/server/show";
import { encryptToken, sessionCookie } from "@/server/security";
import * as generation from "@/server/generation";
import { POST as command } from "@/app/api/shows/[showId]/[...action]/route";
import { GET as status } from "@/app/api/status/route";
let directory: string;
let store: LocalFileStore;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "liveforge-quota-api-"));
  store = new LocalFileStore(directory);
  vi.spyOn(stores, "getStore").mockReturnValue(store);
  vi.mocked(after).mockClear();
  vi.stubEnv("SESSION_SECRET", "quota-api-session-secret-1234567890123");
  vi.stubEnv("TOKEN_ENCRYPTION_KEY", Buffer.alloc(32, 39).toString("base64"));
  vi.stubEnv("APP_BASE_URL", "http://localhost:3100");
  vi.stubEnv("OPENAI_API_KEY", "fixture-provider-key");
  vi.stubEnv("TWITCH_CLIENT_ID", "fixture-app");
  vi.stubEnv("VERCEL_TOKEN", "fixture-control-token");
  vi.stubEnv("VERCEL_TEAM_ID", "team_fixture");
  vi.stubEnv("VERCEL_PROJECT_ID", "prj_fixture");
  vi.stubEnv("LIVEFORGE_GENERATION_HOST_IDS", "");
  vi.stubEnv("LIVEFORGE_GENERATIONS_PER_USER_PER_DAY", "1");
  vi.stubEnv("LIVEFORGE_GENERATIONS_GLOBAL_PER_DAY", "40");
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation(async () =>
      Response.json({
        client_id: "fixture-app",
        login: "fixture-login",
        user_id: "123",
        expires_in: 3600,
        scopes: ["user:read:chat"],
      }),
    ),
  );
});
afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  await rm(directory, { recursive: true, force: true });
});
async function host(
  owner = "verified-host",
  authorized = true,
  mode: "practice" | "twitch" = "practice",
) {
  const show = await createShow(owner, mode, store);
  if (authorized) {
    await store.create("host-auth:" + owner, {
      credentialId: "credential:" + owner,
      userId: "123",
    });
    await store.create("credential:" + owner, {
      ownerId: owner,
      encrypted: encryptToken({
        accessToken: "fixture-twitch-access",
        userId: "123",
        login: "fixture-login",
        scopes: ["user:read:chat"],
        expiresAt: Date.now() + 3_600_000,
      }),
      createdAt: new Date().toISOString(),
    });
  }
  return {
    show,
    cookie: sessionCookie({
      hostId: owner,
      showId: show.id,
      expiresAt: Date.now() + 60_000,
    }).split(";")[0],
  };
}
async function post(
  showId: string,
  cookie: string,
  path: string,
  body: unknown,
  key = crypto.randomUUID(),
) {
  return command(
    new Request(`http://localhost:3100/api/shows/${showId}/${path}`, {
      method: "POST",
      headers: {
        Origin: "http://localhost:3100",
        Cookie: cookie,
        "Content-Type": "application/json",
        "x-idempotency-key": key,
      },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ showId, action: path.split("/") }) },
  );
}
async function proposal(showId: string, cookie: string) {
  const result = await post(showId, cookie, "proposals", {
    text: "A stationary prop casts a solid shadow.",
  });
  expect(result.status).toBe(200);
  return (await result.json()).show.proposals[0].id;
}
describe("public-host generation API quota policy", () => {
  it("allows a non-allowlisted verified host, deduplicates its retry, then caps the same account across shows", async () => {
    const first = await host();
    const proposalId = await proposal(first.show.id, first.cookie);
    const key = "same-generation-request";
    const response = await post(
      first.show.id,
      first.cookie,
      "generate",
      { proposalId },
      key,
    );
    expect(response.status).toBe(202);
    const created = await response.json();
    const repeated = await post(
      first.show.id,
      first.cookie,
      "generate",
      { proposalId },
      key,
    );
    expect(repeated.status).toBe(202);
    expect((await repeated.json()).job.id).toBe(created.job.id);
    const second = await host("second-cookie-same-twitch-account");
    const another = await proposal(second.show.id, second.cookie);
    const denied = await post(second.show.id, second.cookie, "generate", {
      proposalId: another,
    });
    expect(denied.status).toBe(429);
    expect((await denied.json()).message).toContain("previously generated law");
    const health = await status(
      new Request("http://localhost:3100/api/status", {
        headers: { Cookie: second.cookie },
      }),
    );
    const body = await health.json();
    expect(body.generation).toMatchObject({
      allowed: false,
      quota: { userRemaining: 0 },
    });
    expect(body.generation.quota).not.toHaveProperty("actorId");
    expect(JSON.stringify(body)).not.toContain("fixture-twitch-access");
  });
  it("does not let browser body fields choose Sandbox mode or snapshot identity", async () => {
    const authenticated = await host();
    const proposalId = await proposal(
      authenticated.show.id,
      authenticated.cookie,
    );
    const run = vi
      .spyOn(generation, "runGeneration")
      .mockResolvedValue(undefined);
    const response = await post(
      authenticated.show.id,
      authenticated.cookie,
      "generate",
      {
        proposalId,
        sandboxMode: "cold",
        snapshotId: "untrusted-snapshot",
        credentials: { token: "untrusted-control-token" },
      },
    );
    expect(response.status).toBe(202);
    const job = (await response.json()).job;
    const callback = vi.mocked(after).mock.calls.at(-1)![0];
    expect(typeof callback).toBe("function");
    await (callback as () => Promise<void>)();
    expect(run).toHaveBeenCalledWith(
      authenticated.show.id,
      job.id,
      expect.objectContaining({
        teamId: "team_fixture",
        projectId: "prj_fixture",
      }),
    );
    expect(run.mock.calls[0]).toHaveLength(3);
    expect(
      JSON.stringify(
        (await store.get<ShowRecord>(showKey(authenticated.show.id)))!.jobs,
      ),
    ).not.toContain("untrusted-snapshot");
  });
  it("cannot launch a model call without OAuth even in development", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("VERCEL", "");
    const visitor = await host("unsigned-twitch-visitor", false);
    const proposalId = await proposal(visitor.show.id, visitor.cookie);
    const denied = await post(visitor.show.id, visitor.cookie, "generate", {
      proposalId,
    });
    expect(denied.status).toBe(403);
    expect(after).not.toHaveBeenCalled();
    expect(
      (await store.get<ShowRecord>(showKey(visitor.show.id)))!.jobs,
    ).toEqual([]);
    expect(await store.get("generation-quota:v1")).toBeNull();
  });
  it("offers labeled reused source in a Twitch show without OAuth/model spend", async () => {
    const visitor = await host("fallback-owner", false, "twitch");
    const response = await post(
      visitor.show.id,
      visitor.cookie,
      "practice/sample",
      {},
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.show.jobs[0].reused).toBe(true);
    expect(body.show.proposals[0]).toMatchObject({
      origin: "sample",
      author: "Previously generated sample",
    });
    expect(after).not.toHaveBeenCalled();
    expect(await store.get("generation-quota:v1")).toBeNull();
  });
  it("validates the requested proposal before debiting a daily slot", async () => {
    const authenticated = await host();
    const denied = await post(
      authenticated.show.id,
      authenticated.cookie,
      "generate",
      { proposalId: "P404" },
    );
    expect(denied.status).toBe(404);
    expect(await store.get("generation-quota:v1")).toBeNull();
    expect(after).not.toHaveBeenCalled();
  });
});
