import { afterEach, describe, expect, it, vi } from "vitest";
import {
  continueWithoutLaws,
  retireFaultedLaw,
} from "../src/lib/runtime-recovery";

afterEach(() => vi.unstubAllGlobals());

const target = {
  showId: "b98e4bd7-52cb-4ce3-9aad-29d3231767a7",
  revision: 4,
  artifactHash: "a".repeat(64),
  candidateId: "law-a",
  clientId: "tab-a",
  epoch: 2,
};
const fault = {
  kind: "runtime" as const,
  artifactHash: target.artifactHash,
  tick: 360,
};

describe("durable client runtime-fault recovery", () => {
  it("retries a failed request with the same identity and fences the original law/revision", async () => {
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("Network unavailable"))
      .mockResolvedValueOnce(
        Response.json({ show: { activeCandidateId: null, revision: 5 } }),
      );
    vi.stubGlobal("fetch", fetch);
    await expect(
      retireFaultedLaw(target, fault, "Simulation budget exceeded"),
    ).rejects.toThrow();
    const result = await retireFaultedLaw(
      target,
      fault,
      "Simulation budget exceeded",
    );
    expect(result.show.activeCandidateId).toBeNull();
    const first = fetch.mock.calls[0][1] as RequestInit;
    const second = fetch.mock.calls[1][1] as RequestInit;
    expect(first.headers).toEqual(second.headers);
    expect(JSON.parse(second.body as string)).toMatchObject({
      expectedRevision: 4,
      faultedArtifactHash: target.artifactHash,
      clientId: "tab-a",
      epoch: 2,
    });
    const key = (second.headers as Record<string, string>)["x-idempotency-key"];
    expect(key).toMatch(/^[\w-]{8,100}$/);
  });

  it("does not report a fault from another artifact as the current law", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await expect(
      retireFaultedLaw(
        target,
        { ...fault, artifactHash: "b".repeat(64) },
        "Old fault",
      ),
    ).rejects.toThrow("different law");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("stops after any conflict instead of retrying retirement at a newer revision", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ message: "World revision changed" }, { status: 409 }),
      )
      .mockResolvedValueOnce(
        Response.json({
          show: {
            id: target.showId,
            revision: 5,
            activeCandidateId: "law-a",
            candidates: [{ id: "law-a", sourceHash: target.artifactHash }],
            lease: {
              clientId: target.clientId,
              epoch: target.epoch,
              expiresAt: Date.now() + 90000,
            },
          },
        }),
      );
    vi.stubGlobal("fetch", fetch);
    await expect(
      retireFaultedLaw(target, fault, "Budget exceeded"),
    ).rejects.toThrow("World revision changed");
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(
      fetch.mock.calls.filter((call) => call[1].method === "POST"),
    ).toHaveLength(1);
  });

  it("preserves a conflict when the reconciliation read fails", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ message: "Rollback unavailable" }, { status: 409 }),
      )
      .mockRejectedValueOnce(new TypeError("Disconnected"));
    vi.stubGlobal("fetch", fetch);
    await expect(
      retireFaultedLaw(target, fault, "Repeated fault"),
    ).rejects.toMatchObject({ status: 409 });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("explicitly continues without laws against a fresh revision, preserving fault and authority fences", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          show: {
            id: target.showId,
            revision: 7,
            activeCandidateId: target.candidateId,
            activeArtifactHash: target.artifactHash,
            candidates: [
              { id: target.candidateId, sourceHash: target.artifactHash },
            ],
          },
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          show: {
            activeCandidateId: null,
            activeArtifactHash: null,
            revision: 8,
          },
        }),
      );
    vi.stubGlobal("fetch", fetch);
    const result = await continueWithoutLaws(target, fault, "Repeated fault");
    expect(result.show.activeCandidateId).toBeNull();
    expect(JSON.parse(fetch.mock.calls[1][1].body)).toMatchObject({
      expectedRevision: 7,
      faultedArtifactHash: target.artifactHash,
      retireAllLaws: true,
      clientId: target.clientId,
      epoch: target.epoch,
    });
    expect(fetch.mock.calls[1][1].headers["x-idempotency-key"]).toMatch(
      /-all$/,
    );
  });

  it("does not retire a new law when the explicit recovery read finds different source", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(
      Response.json({
        show: {
          id: target.showId,
          revision: 7,
          activeCandidateId: "new-law",
          activeArtifactHash: "b".repeat(64),
          candidates: [],
        },
      }),
    );
    vi.stubGlobal("fetch", fetch);
    const result = await continueWithoutLaws(target, fault, "Late fault");
    expect(result.show.activeCandidateId).toBe("new-law");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("reconciles a newer active law without retiring it", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ message: "World revision changed" }, { status: 409 }),
      )
      .mockResolvedValueOnce(
        Response.json({
          show: {
            id: target.showId,
            revision: 5,
            activeCandidateId: "law-b",
            candidates: [{ id: "law-b", sourceHash: "b".repeat(64) }],
          },
        }),
      );
    vi.stubGlobal("fetch", fetch);
    const result = await retireFaultedLaw(target, fault, "Delayed old fault");
    expect(result.show.activeCandidateId).toBe("law-b");
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("never retries retirement across an authority epoch change", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ message: "Authority changed" }, { status: 409 }),
      )
      .mockResolvedValueOnce(
        Response.json({
          show: {
            id: target.showId,
            revision: 5,
            activeCandidateId: "law-a",
            candidates: [{ id: "law-a", sourceHash: target.artifactHash }],
            lease: {
              clientId: target.clientId,
              epoch: target.epoch + 1,
              expiresAt: Date.now() + 90000,
            },
          },
        }),
      );
    vi.stubGlobal("fetch", fetch);
    await expect(
      retireFaultedLaw(target, fault, "Old authority"),
    ).rejects.toThrow("Authority changed");
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("preserves a new combination even when its newest source/candidate is unchanged", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ message: "Combination changed" }, { status: 409 }),
      )
      .mockResolvedValueOnce(
        Response.json({
          show: {
            id: target.showId,
            revision: 5,
            activeCandidateId: target.candidateId,
            activeArtifactHash: "c".repeat(64),
            candidates: [
              { id: target.candidateId, sourceHash: target.artifactHash },
            ],
          },
        }),
      );
    vi.stubGlobal("fetch", fetch);
    const result = await retireFaultedLaw(
      target,
      fault,
      "Old combination fault",
    );
    expect(result.show.activeArtifactHash).toBe("c".repeat(64));
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
