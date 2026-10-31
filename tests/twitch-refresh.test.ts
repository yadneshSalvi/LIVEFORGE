import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { LocalFileStore } from "@/server/store";
import * as stores from "@/server/store";
import {
  ensureOAuthGrant,
  type Credential,
  type TokenGrant,
} from "@/server/twitch-grants";
import {
  authorizedGrant,
  maintainTwitchSession,
  connectTwitchSession,
} from "@/server/twitch";
import { createShow, showKey, type ShowRecord } from "@/server/show";
import { decryptToken, encryptToken } from "@/server/security";
let directory: string;
let store: LocalFileStore;
const id = "credential:fixture";
const valid = () => ({
  client_id: "fixture-app",
  login: "fixture-host",
  user_id: "123",
  expires_in: 3600,
  scopes: ["user:read:chat"],
});
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "liveforge-refresh-"));
  store = new LocalFileStore(directory);
  vi.spyOn(stores, "getStore").mockReturnValue(store);
  vi.stubEnv("TWITCH_CLIENT_ID", "fixture-app");
  vi.stubEnv("TWITCH_CLIENT_SECRET", "fixture-secret");
  vi.stubEnv("TOKEN_ENCRYPTION_KEY", Buffer.alloc(32, 27).toString("base64"));
  vi.stubEnv("SESSION_SECRET", "refresh-test-session-secret-123456789");
});
afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  await rm(directory, { recursive: true, force: true });
});
async function credential(
  overrides: Partial<Credential> = {},
  grantOverrides: Partial<TokenGrant> = {},
) {
  await store.create<Credential>(id, {
    ownerId: "host",
    source: "oauth-code",
    clientId: "fixture-app",
    status: "ready",
    createdAt: new Date().toISOString(),
    lastValidatedAt: Date.now() - 3_600_001,
    encrypted: encryptToken({
      accessToken: "old-access",
      refreshToken: "old+refresh/%",
      clientId: "fixture-app",
      userId: "123",
      login: "fixture-host",
      scopes: ["user:read:chat"],
      expiresAt: Date.now() - 1,
      ...grantOverrides,
    }),
    ...overrides,
  });
}
const rotated = () =>
  Response.json({
    access_token: "new-access",
    refresh_token: "new-refresh",
    expires_in: 3600,
    scope: ["user:read:chat"],
    token_type: "bearer",
  });
describe("independent OAuth grant maintenance", () => {
  it("reacts to a validation 401 with one same-scope renewal", async () => {
    await credential({}, { expiresAt: Date.now() + 3_600_000 });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({}, { status: 401 }))
      .mockResolvedValueOnce(rotated())
      .mockResolvedValueOnce(Response.json(valid()));
    vi.stubGlobal("fetch", fetchMock);
    expect((await ensureOAuthGrant(id, "host", true)).accessToken).toBe(
      "new-access",
    );
    expect(
      fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/token")),
    ).toHaveLength(1);
  });
  it("recovers an expired maintenance lease after rotated tokens were persisted", async () => {
    await credential(
      {
        status: "pending-validation",
        lock: { owner: "crashed-maintainer", expiresAt: Date.now() - 1 },
      },
      {
        accessToken: "new-access",
        refreshToken: "new-refresh",
        expiresAt: Date.now() + 3_600_000,
      },
    );
    const fetchMock = vi.fn().mockResolvedValue(Response.json(valid()));
    vi.stubGlobal("fetch", fetchMock);
    expect((await ensureOAuthGrant(id, "host")).refreshToken).toBe(
      "new-refresh",
    );
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(String(fetchMock.mock.calls[0][0])).toContain("/validate");
  });
  it("retries a subscription 401 once with the newly renewed grant", async () => {
    await credential({}, { expiresAt: Date.now() + 3_600_000 });
    const state = await createShow("host", "twitch", store);
    await store.update<ShowRecord, void>(showKey(state.id), (show) => {
      show.credentialId = id;
    });
    let subscriptions = 0,
      refreshes = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url: string) => {
        if (url.includes("/helix/")) {
          subscriptions++;
          return subscriptions === 1
            ? Response.json({}, { status: 401 })
            : Response.json(
                { data: [{ id: "renewed-subscription" }] },
                { status: 202 },
              );
        }
        if (url.endsWith("/token")) {
          refreshes++;
          return rotated();
        }
        return Response.json(valid());
      }),
    );
    await connectTwitchSession(state.id, "host", "welcome-session-123");
    expect(subscriptions).toBe(2);
    expect(refreshes).toBe(1);
    expect(
      (await store.get<ShowRecord>(showKey(state.id)))!.twitch.subscriptionId,
    ).toBe("renewed-subscription");
  });

  it("serializes concurrent refreshes and persists rotation before validating the new token", async () => {
    await credential();
    let release!: () => void, entered!: () => void;
    const started = new Promise<void>((r) => (entered = r)),
      gate = new Promise<void>((r) => (release = r));
    let refreshes = 0,
      validations = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url: string, options?: RequestInit) => {
        if (url.endsWith("/token")) {
          refreshes++;
          expect(String(options?.body)).toContain(
            "refresh_token=old%2Brefresh%2F%25",
          );
          entered();
          await gate;
          return rotated();
        }
        validations++;
        const saved = (await store.get<Credential>(id))!;
        expect(saved.status).toBe("pending-validation");
        expect(decryptToken<TokenGrant>(saved.encrypted).refreshToken).toBe(
          "new-refresh",
        );
        return Response.json(valid());
      }),
    );
    const first = ensureOAuthGrant(id, "host");
    await started;
    const second = ensureOAuthGrant(id, "host");
    release();
    const grants = await Promise.all([first, second]);
    expect(grants.map((g) => g.accessToken)).toEqual([
      "new-access",
      "new-access",
    ]);
    expect(refreshes).toBe(1);
    expect(validations).toBe(1);
    const saved = (await store.get<Credential>(id))!;
    expect(saved.status).toBe("ready");
    expect(saved.lock).toBeUndefined();
    expect(saved.rotationVersion).toBe(1);
  });
  it("recovers persisted rotated tokens after a transient follow-up validation failure", async () => {
    await credential();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(rotated())
      .mockRejectedValueOnce(new Error("fixture-network-failure"));
    vi.stubGlobal("fetch", fetchMock);
    await expect(ensureOAuthGrant(id, "host")).rejects.toThrow(
      /could not be checked/,
    );
    const saved = (await store.get<Credential>(id))!;
    expect(saved.status).toBe("pending-validation");
    expect(decryptToken<TokenGrant>(saved.encrypted).refreshToken).toBe(
      "new-refresh",
    );
    await store.update<Credential, void>(id, (r) => {
      delete r.retryAfter;
    });
    fetchMock.mockResolvedValueOnce(Response.json(valid()));
    expect((await ensureOAuthGrant(id, "host")).accessToken).toBe("new-access");
    expect(
      fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/token")),
    ).toHaveLength(1);
  });
  it("marks an invalid refresh grant revoked and prevents a repeated refresh storm", async () => {
    await credential();
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        Response.json({ error: "invalid refresh" }, { status: 400 }),
      );
    vi.stubGlobal("fetch", fetchMock);
    await expect(ensureOAuthGrant(id, "host")).rejects.toThrow(/revoked/);
    await expect(ensureOAuthGrant(id, "host")).rejects.toThrow(/revoked/);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect((await store.get<Credential>(id))!.status).toBe("revoked");
  });
  it.each(["identity", "scope"])(
    "retains rotation but rejects changed %s",
    async (change) => {
      await credential();
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(
          change === "scope"
            ? Response.json({
                access_token: "new-access",
                refresh_token: "new-refresh",
                expires_in: 3600,
                scope: ["user:read:chat", "user:write:chat"],
              })
            : rotated(),
        )
        .mockResolvedValueOnce(Response.json({ ...valid(), user_id: "999" }));
      vi.stubGlobal("fetch", fetchMock);
      await expect(ensureOAuthGrant(id, "host")).rejects.toThrow(/changed/);
      const saved = (await store.get<Credential>(id))!;
      expect(saved.status).toBe("revoked");
      expect(decryptToken<TokenGrant>(saved.encrypted).refreshToken).toBe(
        "new-refresh",
      );
    },
  );
  it("validates hourly while caching fresh grants and never widens scopes", async () => {
    await credential(
      { lastValidatedAt: Date.now() },
      { expiresAt: Date.now() + 3_600_000 },
    );
    const fetchMock = vi.fn().mockResolvedValue(Response.json(valid()));
    vi.stubGlobal("fetch", fetchMock);
    await ensureOAuthGrant(id, "host");
    expect(fetchMock).not.toHaveBeenCalled();
    await store.update<Credential, void>(id, (r) => {
      r.lastValidatedAt = Date.now() - 3_600_001;
    });
    await ensureOAuthGrant(id, "host");
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(String(fetchMock.mock.calls[0][0])).toContain("/validate");
    await expect(ensureOAuthGrant(id, "intruder")).rejects.toThrow(
      /does not own/,
    );
  });
  it("never automatically refreshes unmarked legacy or copied bootstrap credentials", async () => {
    await credential({ source: undefined });
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        Response.json({ message: "invalid" }, { status: 401 }),
      );
    vi.stubGlobal("fetch", fetchMock);
    await expect(ensureOAuthGrant(id, "host")).rejects.toThrow(
      /Reconnect Twitch once/,
    );
    expect(fetchMock).not.toHaveBeenCalled();
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("TWITCH_USER_ACCESS_TOKEN", "copied-bootstrap-access");
    const state = await createShow("host", "twitch", store);
    const show = (await store.get<ShowRecord>(showKey(state.id)))!;
    await expect(authorizedGrant(show)).rejects.toThrow(/revoked/);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(String(fetchMock.mock.calls[0][0])).toContain("/validate");
  });
  it("ends the live OAuth session on revocation while preserving the game", async () => {
    await credential();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ error: "invalid refresh" }, { status: 401 }),
        ),
    );
    const state = await createShow("host", "twitch", store);
    await store.update<ShowRecord, void>(showKey(state.id), (s) => {
      s.credentialId = id;
      s.twitch.status = "connected";
    });
    const show = (await store.get<ShowRecord>(showKey(state.id)))!;
    const maintained = await maintainTwitchSession(show);
    expect(maintained.twitch.status).toBe("revoked");
    expect(maintained.activeCandidateId).toBeNull();
    expect(maintained.checkpoint).toBeNull();
  });
});
