import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { LocalFileStore } from "@/server/store";
import {
  generationQuota,
  generationRequest,
  reserveGenerationQuota,
  type GenerationIdentity,
} from "@/server/generation-quota";
let directory: string;
let store: LocalFileStore;
const timestamp = Date.parse("2026-11-01T23:59:59.000Z");
const actor: GenerationIdentity = {
  actorId: "hashed-verified-twitch-user",
  exempt: false,
};
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "liveforge-quota-"));
  store = new LocalFileStore(directory);
  vi.stubEnv("LIVEFORGE_GENERATIONS_PER_USER_PER_DAY", "");
  vi.stubEnv("LIVEFORGE_GENERATIONS_GLOBAL_PER_DAY", "");
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(directory, { recursive: true, force: true });
});
const request = (key: string, showId = "show-one", proposalId = "P1") =>
  generationRequest(showId, "host-session", key, { proposalId });
describe("durable generation quotas", () => {
  it("bounds high-cap receipt retention and never stores exempt traffic", async () => {
    vi.stubEnv("LIVEFORGE_GENERATIONS_PER_USER_PER_DAY", "2000");
    vi.stubEnv("LIVEFORGE_GENERATIONS_GLOBAL_PER_DAY", "2000");
    const days: Record<
      string,
      { total: number; users: Record<string, number> }
    > = {};
    const reservations: Record<
      string,
      { actorId: string; requestHash: string; showId: string; day: string }
    > = {};
    for (const day of ["2026-10-30", "2026-10-31"]) {
      const users: Record<string, number> = {};
      for (let i = 0; i < 2000; i++) {
        const actorId = i.toString(16).padStart(64, "0");
        users[actorId] = 1;
        reservations[(day + ":" + i).padEnd(64, "f")] = {
          actorId,
          requestHash: "a".repeat(64),
          showId: "00000000-0000-0000-0000-000000000000",
          day,
        };
      }
      days[day] = { total: 2000, users };
    }
    expect(
      Buffer.byteLength(JSON.stringify({ days, reservations })),
    ).toBeLessThan(2_000_000);
    await store.create("generation-quota:v1", { days, reservations });
    await reserveGenerationQuota(
      actor,
      request("high-cap-fresh"),
      store,
      timestamp,
    );
    const ledger = (await store.get<{ days: object; reservations: object }>(
      "generation-quota:v1",
    ))!;
    expect(Object.keys(ledger.days).sort()).toEqual([
      "2026-10-31",
      "2026-11-01",
    ]);
    expect(Object.keys(ledger.reservations)).toHaveLength(2001);
    expect(Buffer.byteLength(JSON.stringify(ledger))).toBeLessThan(1_000_000);
    const before = JSON.stringify(ledger);
    for (let i = 0; i < 100; i++)
      await reserveGenerationQuota(
        { actorId: "exempt", exempt: true },
        request("exempt-run-" + i),
        store,
        timestamp,
      );
    expect(JSON.stringify(await store.get("generation-quota:v1"))).toBe(before);
  });

  it("shares the default three-run user allowance across shows and independent store clients", async () => {
    const other = new LocalFileStore(directory);
    for (let i = 0; i < 3; i++)
      await reserveGenerationQuota(
        actor,
        request("request-" + i, "show-" + i),
        i % 2 ? other : store,
        timestamp,
      );
    await expect(
      reserveGenerationQuota(
        actor,
        request("request-four", "show-four"),
        other,
        timestamp,
      ),
    ).rejects.toMatchObject({ status: 429, code: "generation_quota" });
    expect((await generationQuota(actor, store, timestamp)).userRemaining).toBe(
      0,
    );
  });
  it("atomically enforces a shared global cap without combining users' identities in output", async () => {
    vi.stubEnv("LIVEFORGE_GENERATIONS_GLOBAL_PER_DAY", "2");
    await reserveGenerationQuota(
      actor,
      request("request-one"),
      store,
      timestamp,
    );
    const second = { actorId: "another-hashed-user", exempt: false };
    await reserveGenerationQuota(
      second,
      request("request-two", "show-two"),
      store,
      timestamp,
    );
    await expect(
      reserveGenerationQuota(
        { actorId: "third-user", exempt: false },
        request("request-three", "show-three"),
        store,
        timestamp,
      ),
    ).rejects.toMatchObject({ code: "generation_quota" });
    const view = await generationQuota(actor, store, timestamp);
    expect(view.globalRemaining).toBe(0);
    expect(JSON.stringify(view)).not.toContain(actor.actorId);
  });
  it("deduplicates concurrent retries under cross-process locking and cannot overbook", async () => {
    const other = new LocalFileStore(directory);
    const outcomes = await Promise.allSettled(
      Array.from({ length: 12 }, (_, i) =>
        reserveGenerationQuota(
          actor,
          request("concurrent-" + i, "show-" + i),
          i % 2 ? store : other,
          timestamp,
        ),
      ),
    );
    expect(
      outcomes.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(3);
    expect((await generationQuota(actor, store, timestamp)).userRemaining).toBe(
      0,
    );
    const unique = request("same-request", "different-show");
    const one = { actorId: "second-hashed-user", exempt: false };
    const copies = await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        reserveGenerationQuota(one, unique, i % 2 ? store : other, timestamp),
      ),
    );
    expect(new Set(copies.map((item) => item.jobId)).size).toBe(1);
    expect((await generationQuota(one, store, timestamp)).userRemaining).toBe(
      2,
    );
  });
  it("resets on the UTC boundary while replaying a pre-midnight reservation without a second debit", async () => {
    const original = request("midnight-retry");
    const reservation = await reserveGenerationQuota(
      actor,
      original,
      store,
      timestamp,
    );
    const midnight = timestamp + 2000;
    const recovered = await reserveGenerationQuota(
      actor,
      original,
      new LocalFileStore(directory),
      midnight,
    );
    expect(recovered).toEqual(reservation);
    expect(recovered.day).toBe("2026-11-01");
    const fresh = await generationQuota(actor, store, midnight);
    expect(fresh.day).toBe("2026-11-02");
    expect(fresh.userRemaining).toBe(3);
    await reserveGenerationQuota(
      actor,
      request("next-day-request"),
      store,
      midnight,
    );
    expect((await generationQuota(actor, store, midnight)).userRemaining).toBe(
      2,
    );
  });
  it("recovers the same logical job after a reservation-before-show-write crash", async () => {
    const pending = request("request-before-crash");
    const reserved = await reserveGenerationQuota(
      actor,
      pending,
      store,
      timestamp,
    );
    const recreated = generationRequest(
      pending.showId,
      "host-session",
      "request-before-crash",
      { proposalId: "P1" },
    );
    expect(
      (
        await reserveGenerationQuota(
          actor,
          recreated,
          new LocalFileStore(directory),
          timestamp + 2000,
        )
      ).jobId,
    ).toBe(reserved.jobId);
    expect((await generationQuota(actor, store, timestamp)).userRemaining).toBe(
      2,
    );
  });
  it("rejects a reused request key with different proposal input", async () => {
    await reserveGenerationQuota(
      actor,
      request("same-key-forged"),
      store,
      timestamp,
    );
    await expect(
      reserveGenerationQuota(
        actor,
        request("same-key-forged", "show-one", "P2"),
        store,
        timestamp,
      ),
    ).rejects.toMatchObject({ code: "idempotency_conflict" });
  });
  it("does not charge allowlisted exemptions against the public pool", async () => {
    vi.stubEnv("LIVEFORGE_GENERATIONS_PER_USER_PER_DAY", "0");
    vi.stubEnv("LIVEFORGE_GENERATIONS_GLOBAL_PER_DAY", "0");
    const privileged = { actorId: "exempt-hashed-user", exempt: true };
    await reserveGenerationQuota(
      privileged,
      request("exempt-first"),
      store,
      timestamp,
    );
    await reserveGenerationQuota(
      privileged,
      request("exempt-second", "show-two"),
      store,
      timestamp,
    );
    expect(await generationQuota(privileged, store, timestamp)).toMatchObject({
      exempt: true,
      exhausted: false,
      userRemaining: null,
      globalRemaining: null,
    });
    expect((await generationQuota(actor, store, timestamp)).exhausted).toBe(
      true,
    );
  });
  it("fails closed on invalid quota configuration", async () => {
    vi.stubEnv("LIVEFORGE_GENERATIONS_GLOBAL_PER_DAY", "unlimited");
    await expect(
      generationQuota(actor, store, timestamp),
    ).rejects.toMatchObject({ code: "quota_configuration" });
  });
});
