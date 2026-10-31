import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("next/server", () => ({ after: vi.fn() }));
import { after } from "next/server";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ENGINE_VERSION } from "@/game/contracts";
import { LocalFileStore } from "@/server/store";
import * as stores from "@/server/store";
import { LEGACY_ENGINE_VERSION } from "@/server/composition";
import { showKey, type ShowRecord } from "@/server/show";
import { sessionCookie } from "@/server/security";
import { POST } from "@/app/api/shows/[showId]/[...action]/route";
import { GET as current } from "@/app/api/shows/current/route";
let directory: string;
let store: LocalFileStore;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "liveforge-legacy-api-"));
  store = new LocalFileStore(directory);
  vi.spyOn(stores, "getStore").mockReturnValue(store);
  vi.mocked(after).mockClear();
  vi.stubEnv("SESSION_SECRET", "legacy-regression-secret-123456789012345");
  vi.stubEnv("APP_BASE_URL", "http://localhost:3100");
});
afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await rm(directory, { recursive: true, force: true });
});
async function fixture() {
  const at = new Date().toISOString();
  // Persist the old shape directly: never run the new constructor or normalize away the missing fields.
  const old = {
    id: "legacy-show",
    ownerId: "legacy-owner",
    mode: "practice",
    createdAt: at,
    updatedAt: at,
    revision: 7,
    round: 2,
    phase: "live",
    proposals: [
      {
        id: "P1",
        text: "A stationary prop casts a solid shadow.",
        author: "Original inventor",
        origin: "practice",
        createdAt: at,
        status: "selected",
        votes: 3,
      },
    ],
    jobs: [
      {
        id: "historical-job",
        proposalId: "P1",
        status: "failed",
        createdAt: at,
        updatedAt: at,
        attempt: 1,
        model: "historical-model",
        message: "Retained history",
        baseRevision: 6,
      },
    ],
    candidates: [],
    activeCandidateId: null,
    previousCandidateId: null,
    checkpoint: {
      snapshot: {
        version: LEGACY_ENGINE_VERSION,
        legacyData: "opaque old-engine world",
      },
      program: null,
      artifactHash: null,
    },
    previousCheckpoint: null,
    lease: null,
    twitch: { status: "disconnected", message: "Not connected" },
    events: [],
    votingOpen: true,
    voters: {},
    seenMessages: [],
    rates: {},
    idempotency: {},
  };
  await store.create(showKey(old.id), old);
  const cookie = sessionCookie({
    hostId: old.ownerId,
    showId: old.id,
    expiresAt: Date.now() + 60000,
  }).split(";")[0];
  return { old, cookie };
}
function request(
  cookie: string,
  path: string,
  body: unknown,
  key = crypto.randomUUID(),
) {
  return POST(
    new Request("http://localhost:3100/api/shows/legacy-show/" + path, {
      method: "POST",
      headers: {
        Origin: "http://localhost:3100",
        Cookie: cookie,
        "Content-Type": "application/json",
        "x-idempotency-key": key,
      },
      body: JSON.stringify(body),
    }),
    {
      params: Promise.resolve({
        showId: "legacy-show",
        action: path.split("/"),
      }),
    },
  );
}
describe("persisted engine1 API boundary without engine2 optional fields", () => {
  it("returns a successful fenced lease and permits explicit upgrade while preserving opaque old history", async () => {
    const { old, cookie } = await fixture();
    const read = await current(
      new Request("http://localhost:3100/api/shows/current", {
        headers: { Cookie: cookie },
      }),
    );
    expect(read.status).toBe(200);
    const initial = (await read.json()).show;
    expect(initial.settings).toEqual({
      blockedTerms: [],
      chatRepliesEnabled: false,
    });
    expect(initial.engineUpgradeRequired).toBe(true);
    expect(initial.activeCandidateIds).toEqual([]);
    const leaseResponse = await request(cookie, "lease", {
      clientId: "legacy-active-tab",
    });
    expect(leaseResponse.status).toBe(200);
    const leased = (await leaseResponse.json()).show;
    expect(leased.lease).toMatchObject({
      clientId: "legacy-active-tab",
      epoch: 1,
    });
    expect(leased.settings.chatRepliesEnabled).toBe(false);
    const persistedBefore = (await store.get<Record<string, unknown>>(
      showKey(old.id),
    ))!;
    expect(persistedBefore).not.toHaveProperty("settings");
    expect(persistedBefore.checkpoint).toEqual(old.checkpoint);
    const premature = await request(cookie, "checkpoint", {
      clientId: "legacy-active-tab",
      epoch: 1,
      checkpoint: old.checkpoint,
    });
    expect(premature.status).toBe(409);
    expect((await premature.json()).error).toBe("engine_upgrade_required");
    const upgraded = await request(cookie, "upgrade", {
      clientId: "legacy-active-tab",
      epoch: 1,
      expectedRevision: 7,
      targetEngineVersion: ENGINE_VERSION,
    });
    expect(upgraded.status).toBe(200);
    const state = (await upgraded.json()).show;
    expect(state.engineVersion).toBe(ENGINE_VERSION);
    expect(state.engineUpgradeRequired).toBe(false);
    expect(state.revision).toBe(8);
    expect(state.checkpoint.snapshot.version).toBe(ENGINE_VERSION);
    expect(state.settings.chatRepliesEnabled).toBe(false);
    const persisted = (await store.get<ShowRecord>(showKey(old.id)))!;
    expect(persisted.engineArchives![0].checkpoint).toEqual(old.checkpoint);
    expect(persisted.proposals[0].text).toBe(old.proposals[0].text);
    expect(persisted.jobs[0]).toEqual(old.jobs[0]);
    expect(state).not.toHaveProperty("engineArchives");
    expect(after).not.toHaveBeenCalled();
  });
  it("keeps round/resume responses and safe legacy settings updates usable before upgrade", async () => {
    const { cookie } = await fixture();
    expect((await request(cookie, "round", { votingOpen: false })).status).toBe(
      200,
    );
    expect((await request(cookie, "resume", {})).status).toBe(200);
    const settings = await request(cookie, "settings", {
      blockedTerms: ["Blocked phrase"],
      chatRepliesEnabled: false,
    });
    expect(settings.status).toBe(200);
    const state = (await settings.json()).show;
    expect(state.settings).toEqual({
      blockedTerms: ["blocked phrase"],
      chatRepliesEnabled: false,
    });
    expect(state.engineUpgradeRequired).toBe(true);
    expect(after).not.toHaveBeenCalled();
  });
});
