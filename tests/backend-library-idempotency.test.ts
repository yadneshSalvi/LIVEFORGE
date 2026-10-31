import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("next/server", () => ({ after: vi.fn() }));
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GameEngine } from "@/game/core";
import { LocalFileStore } from "@/server/store";
import * as stores from "@/server/store";
import {
  approveCandidate,
  createShow,
  importPracticeSample,
  showKey,
  type ShowRecord,
} from "@/server/show";
import { listLibrary } from "@/server/library";
import { sessionCookie } from "@/server/security";
import { POST } from "@/app/api/shows/[showId]/[...action]/route";

let directory: string, store: LocalFileStore;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "liveforge-library-retries-"));
  store = new LocalFileStore(directory);
  vi.spyOn(stores, "getStore").mockReturnValue(store);
  vi.stubEnv("SESSION_SECRET", "library-api-test-secret-123456789012345");
  vi.stubEnv("APP_BASE_URL", "http://localhost:3100");
});
afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await rm(directory, { recursive: true, force: true });
});
async function fixture() {
  const state = await createShow("library-owner", "practice", store);
  const candidates = await store.update<ShowRecord, string[]>(
    showKey(state.id),
    (show) =>
      (["shadow", "step"] as const).map((sample) => {
        const candidate = importPracticeSample(show, sample);
        const engine = new GameEngine();
        engine.activate(
          candidate.composition!.program,
          candidate.composition!.artifactHash,
        );
        approveCandidate(
          show,
          candidate.id,
          candidate.sourceHash,
          candidate.programHash,
          engine.checkpoint(),
          candidate.composition,
        );
        return candidate.id;
      }),
  );
  const cookie = sessionCookie({
    hostId: "library-owner",
    showId: state.id,
    expiresAt: Date.now() + 60000,
  }).split(";")[0];
  const command = (candidateId: string, key = "library-request-one") =>
    POST(
      new Request(`http://localhost:3100/api/shows/${state.id}/library/save`, {
        method: "POST",
        headers: {
          Origin: "http://localhost:3100",
          Cookie: cookie,
          "Content-Type": "application/json",
          "x-idempotency-key": key,
        },
        body: JSON.stringify({ candidateId }),
      }),
      {
        params: Promise.resolve({
          showId: state.id,
          action: ["library", "save"],
        }),
      },
    );
  return { state, candidates, command };
}

describe("library save command reservation", () => {
  it("rejects a reused request key for another approved source before writing it", async () => {
    const { candidates, command } = await fixture();
    expect((await command(candidates[0])).status).toBe(200);
    const conflict = await command(candidates[1]);
    expect(conflict.status).toBe(409);
    expect((await conflict.json()).error).toBe("idempotency_conflict");
    expect(await listLibrary("library-owner")).toHaveLength(1);
  });

  it("arbitrates concurrent different-source requests with one durable winning claim", async () => {
    const { candidates, command } = await fixture();
    const responses = await Promise.all(
      candidates.map((candidate) => command(candidate)),
    );
    expect(responses.map((response) => response.status).sort()).toEqual([
      200, 409,
    ]);
    expect(await listLibrary("library-owner")).toHaveLength(1);
  });

  it("replays the same save once with the same entry and saved timestamp", async () => {
    const { state, candidates, command } = await fixture();
    const responses = await Promise.all([
      command(candidates[0]),
      command(candidates[0]),
    ]);
    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    const [first, second] = await Promise.all(
      responses.map((response) => response.json()),
    );
    expect(second.entry).toEqual(first.entry);
    expect(await listLibrary("library-owner")).toHaveLength(1);
    const show = (await store.get<ShowRecord>(showKey(state.id)))!;
    expect(
      show.events.filter((event) => event.type === "private.library.saved"),
    ).toHaveLength(1);
  });

  it("recovers a lost completion receipt after the library write without duplicating history or source", async () => {
    const { state, candidates, command } = await fixture();
    const update = store.update.bind(store);
    let showWrites = 0;
    vi.spyOn(store, "update").mockImplementation(async (key, fn) => {
      if (key === showKey(state.id) && ++showWrites === 2)
        throw new Error("controlled completion write outage");
      return update(key, fn);
    });
    expect((await command(candidates[0])).status).toBe(503);
    const beforeRetry = await listLibrary("library-owner");
    expect(beforeRetry).toHaveLength(1);
    const retried = await command(candidates[0]);
    expect(retried.status).toBe(200);
    expect((await retried.json()).entry).toEqual(beforeRetry[0]);
    expect(await listLibrary("library-owner")).toHaveLength(1);
    const show = (await store.get<ShowRecord>(showKey(state.id)))!;
    expect(
      show.events.filter((event) => event.type === "private.library.saved"),
    ).toHaveLength(1);
  });
});
