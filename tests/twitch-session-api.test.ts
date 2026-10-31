import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("next/server", () => ({ after: vi.fn() }));
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { LocalFileStore } from "@/server/store";
import * as stores from "@/server/store";
import { createShow, showKey, type ShowRecord } from "@/server/show";
import { encryptToken, sessionCookie } from "@/server/security";
import { POST } from "@/app/api/shows/[showId]/[...action]/route";
let directory: string, store: LocalFileStore;
let subscription = vi.fn<() => Promise<Response>>();
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "liveforge-twitch-attempt-"));
  store = new LocalFileStore(directory);
  vi.spyOn(stores, "getStore").mockReturnValue(store);
  vi.stubEnv("SESSION_SECRET", "twitch-attempt-session-secret-123456789");
  vi.stubEnv("TOKEN_ENCRYPTION_KEY", Buffer.alloc(32, 51).toString("base64"));
  vi.stubEnv("APP_BASE_URL", "http://localhost:3100");
  vi.stubEnv("TWITCH_CLIENT_ID", "fixture-app");
  subscription = vi.fn(async () =>
    Response.json({ data: [{ id: "fixture-subscription" }] }, { status: 202 }),
  );
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url === "https://id.twitch.tv/oauth2/validate")
        return Response.json({
          client_id: "fixture-app",
          login: "fixture-host",
          user_id: "123",
          expires_in: 3600,
          scopes: ["user:read:chat"],
        });
      if (url === "https://api.twitch.tv/helix/eventsub/subscriptions")
        return subscription();
      throw new Error("Unexpected synthetic URL");
    }),
  );
});
afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  await rm(directory, { recursive: true, force: true });
});
async function fixture() {
  const show = await createShow("host", "twitch", store);
  await store.create("credential:fixture", {
    ownerId: "host",
    source: "oauth-code",
    clientId: "fixture-app",
    status: "ready",
    lastValidatedAt: Date.now(),
    createdAt: new Date().toISOString(),
    encrypted: encryptToken({
      clientId: "fixture-app",
      accessToken: "synthetic-private-access",
      refreshToken: "synthetic-private-refresh",
      userId: "123",
      login: "fixture-host",
      scopes: ["user:read:chat"],
      expiresAt: Date.now() + 3600000,
    }),
  });
  await store.update<ShowRecord, void>(showKey(show.id), (state) => {
    state.credentialId = "credential:fixture";
    state.twitch.channelId = "123";
  });
  const cookie = sessionCookie({
    hostId: "host",
    showId: show.id,
    expiresAt: Date.now() + 60000,
  }).split(";")[0];
  return { id: show.id, cookie };
}
async function post(
  host: { id: string; cookie: string },
  body: unknown,
  key = crypto.randomUUID(),
  path = "twitch/session",
) {
  return POST(
    new Request(`http://localhost:3100/api/shows/${host.id}/${path}`, {
      method: "POST",
      headers: {
        Origin: "http://localhost:3100",
        Cookie: host.cookie,
        "Content-Type": "application/json",
        "x-idempotency-key": key,
      },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ showId: host.id, action: path.split("/") }) },
  );
}
describe("durable Twitch connection attempt idempotency", () => {
  it("allows only the first concurrent owner, rejects mismatched session/reconnect, and completes identical replay without another POST", async () => {
    const host = await fixture();
    let entered!: () => void, release!: () => void;
    const started = new Promise<void>((r) => {
        entered = r;
      }),
      gate = new Promise<void>((r) => {
        release = r;
      });
    subscription.mockImplementationOnce(async () => {
      entered();
      await gate;
      return Response.json(
        { data: [{ id: "fixture-subscription" }] },
        { status: 202 },
      );
    });
    const key = "same-connection-attempt",
      body = { sessionId: "socket-session-one", reconnect: false };
    const first = post(host, body, key);
    await started;
    const replay = await post(host, body, key);
    expect(replay.status).toBe(409);
    expect((await replay.json()).error).toBe(
      "twitch_connection_attempt_consumed",
    );
    expect(
      (await post(host, { sessionId: "socket-session-two" }, key)).status,
    ).toBe(409);
    expect(
      (await post(host, { sessionId: body.sessionId, reconnect: true }, key))
        .status,
    ).toBe(409);
    expect(subscription).toHaveBeenCalledOnce();
    release();
    expect((await first).status).toBe(200);
    const completed = await post(host, body, key);
    expect(completed.status).toBe(200);
    expect(subscription).toHaveBeenCalledOnce();
    const state = (await store.get<ShowRecord>(showKey(host.id)))!;
    expect(state.rates["twitch-session"]).toHaveLength(1);
    expect(state.idempotency[key].result).toMatchObject({
      operation: "twitch/session",
      sessionId: body.sessionId,
      reconnect: false,
      status: "completed",
    });
    expect(JSON.stringify(await completed.json())).not.toMatch(
      /attemptOwner|synthetic-private-access|synthetic-private-refresh/,
    );
  });
  it("consumes an unknown provider outcome permanently under the old key and permits a fresh bounded connection", async () => {
    const host = await fixture(),
      key = "lost-provider-response";
    vi.spyOn(console, "error").mockImplementation(() => {});
    subscription.mockRejectedValueOnce(
      new TypeError("synthetic response lost"),
    );
    expect(
      (await post(host, { sessionId: "socket-unknown-one" }, key)).status,
    ).toBe(503);
    expect(
      (await post(host, { sessionId: "socket-unknown-one" }, key)).status,
    ).toBe(409);
    expect(subscription).toHaveBeenCalledOnce();
    expect(
      (
        await post(
          host,
          { sessionId: "socket-fresh-two" },
          "fresh-connection-key",
        )
      ).status,
    ).toBe(200);
    expect(subscription).toHaveBeenCalledTimes(2);
    const state = (await store.get<ShowRecord>(showKey(host.id)))!;
    expect(state.idempotency[key].result).toMatchObject({ status: "unknown" });
    expect(state.rates["twitch-session"]).toHaveLength(2);
  });
  it("retains pending and completed connection receipts while ordinary command receipts rotate", async () => {
    const host = await fixture();
    let entered!: () => void, release!: () => void;
    const started = new Promise<void>((r) => {
        entered = r;
      }),
      gate = new Promise<void>((r) => {
        release = r;
      });
    subscription.mockImplementationOnce(async () => {
      entered();
      await gate;
      return Response.json(
        { data: [{ id: "fixture-subscription" }] },
        { status: 202 },
      );
    });
    const key = "pinned-connection-key",
      body = { sessionId: "socket-session-pinned" };
    const first = post(host, body, key);
    await started;
    for (let i = 0; i < 65; i++)
      expect(
        (
          await post(
            host,
            { votingOpen: i % 2 === 0 },
            "ordinary-command-" + i,
            "round",
          )
        ).status,
      ).toBe(200);
    expect((await post(host, body, key)).status).toBe(409);
    expect(subscription).toHaveBeenCalledOnce();
    release();
    expect((await first).status).toBe(200);
    const state = (await store.get<ShowRecord>(showKey(host.id)))!;
    expect(Object.keys(state.idempotency)).toHaveLength(61);
    expect(state.idempotency[key].result).toMatchObject({
      status: "completed",
    });
    expect(
      (await post(host, { sessionId: "different-session-after-rotation" }, key))
        .status,
    ).toBe(409);
    expect((await post(host, body, key)).status).toBe(200);
    expect(subscription).toHaveBeenCalledOnce();
  });
  it("rejects operation-key conflicts in both directions without side effects", async () => {
    const host = await fixture();
    expect(
      (
        await post(
          host,
          { votingOpen: false },
          "ordinary-operation-key",
          "round",
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await post(
          host,
          { sessionId: "socket-conflict-one" },
          "ordinary-operation-key",
        )
      ).status,
    ).toBe(409);
    expect(subscription).not.toHaveBeenCalled();
    expect(
      (
        await post(
          host,
          { sessionId: "socket-conflict-two" },
          "connection-operation-key",
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await post(
          host,
          { votingOpen: true },
          "connection-operation-key",
          "round",
        )
      ).status,
    ).toBe(409);
    expect(subscription).toHaveBeenCalledOnce();
    await store.update<ShowRecord, void>(showKey(host.id), (show) => {
      show.idempotency["old-void-operation"] = {
        at: Date.now(),
        result: undefined,
      };
    });
    expect(
      (
        await post(
          host,
          { sessionId: "socket-conflict-three" },
          "old-void-operation",
        )
      ).status,
    ).toBe(409);
    expect(subscription).toHaveBeenCalledOnce();
  });
  it("charges new attempts against eight per minute and cannot reset that budget by replaying a key", async () => {
    const host = await fixture();
    for (let i = 0; i < 8; i++)
      expect(
        (
          await post(
            host,
            { sessionId: "socket-rate-session-" + i },
            "connection-rate-key-" + i,
          )
        ).status,
      ).toBe(200);
    expect(
      (
        await post(
          host,
          { sessionId: "socket-rate-session-nine" },
          "connection-rate-key-nine",
        )
      ).status,
    ).toBe(429);
    expect(subscription).toHaveBeenCalledTimes(8);
    expect(
      (
        await post(
          host,
          { sessionId: "socket-rate-session-new" },
          "connection-rate-key-0",
        )
      ).status,
    ).toBe(409);
    const replay = await post(
      host,
      { sessionId: "socket-rate-session-0" },
      "connection-rate-key-0",
    );
    expect(replay.status).toBe(200);
    expect((await replay.json()).show.twitch.sessionId).toBe(
      "socket-rate-session-7",
    );
    expect(subscription).toHaveBeenCalledTimes(8);
  });
  it("bounds pinned history without dropping deduplication receipts", async () => {
    const host = await fixture();
    await store.update<ShowRecord, void>(showKey(host.id), (show) => {
      for (let i = 0; i < 128; i++)
        show.idempotency["retained-key-" + i] = {
          at: Date.now(),
          result: {
            operation: "twitch/session",
            sessionId: "old-session-" + i,
            reconnect: false,
            attemptOwner: "old-owner-" + i,
            status: "completed",
          },
        };
    });
    const full = await post(
      host,
      { sessionId: "socket-history-full" },
      "new-history-attempt",
    );
    expect(full.status).toBe(429);
    expect((await full.json()).error).toBe("twitch_connection_history_full");
    expect(subscription).not.toHaveBeenCalled();
    expect(
      (await post(host, { sessionId: "old-session-0" }, "retained-key-0"))
        .status,
    ).toBe(200);
    expect(subscription).not.toHaveBeenCalled();
  });
});
