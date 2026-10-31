import { afterEach, describe, expect, it, vi } from "vitest";
import { retireFaultedLaw } from "../src/lib/runtime-recovery";

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
      faultedSourceHash: target.artifactHash,
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

  it("refreshes a benign revision race and retires the same law under the same authority", async () => {
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
      )
      .mockResolvedValueOnce(
        Response.json({ show: { activeCandidateId: null, revision: 6 } }),
      );
    vi.stubGlobal("fetch", fetch);
    const result = await retireFaultedLaw(target, fault, "Budget exceeded");
    expect(result.show.activeCandidateId).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(JSON.parse(fetch.mock.calls[2][1].body)).toMatchObject({
      expectedRevision: 5,
      faultedSourceHash: target.artifactHash,
      epoch: target.epoch,
    });
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
});
