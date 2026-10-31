import { afterEach, describe, expect, it, vi } from "vitest";
import { api, ApiError } from "../src/lib/api";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function stalledFetch() {
  return vi.fn(
    (_path: string, options: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        const signal = options.signal!;
        if (signal.aborted) reject(signal.reason);
        else
          signal.addEventListener("abort", () => reject(signal.reason), {
            once: true,
          });
      }),
  );
}

describe("browser API deadlines and recovery", () => {
  it("aborts a stalled session request and returns useful retry copy", async () => {
    vi.useFakeTimers();
    const fetch = stalledFetch();
    vi.stubGlobal("fetch", fetch);
    const pending = api("/api/shows/current");
    const rejected = expect(pending).rejects.toMatchObject({
      status: 408,
      code: "REQUEST_TIMEOUT",
      message: expect.stringContaining("Please retry"),
    });
    await vi.advanceTimersByTimeAsync(20_000);
    await rejected;
    expect(fetch.mock.calls[0][1].signal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("honors earlier caller cancellation without claiming a timeout", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", stalledFetch());
    const controller = new AbortController();
    const pending = api("/api/shows/current", undefined, controller.signal);
    const rejected = expect(pending).rejects.toMatchObject({
      name: "AbortError",
    });
    controller.abort();
    await rejected;
    expect(vi.getTimerCount()).toBe(0);
  });

  it("shows the server's human message and keeps its machine code separately", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          {
            error: "LEASE_HELD",
            message: "Another game tab currently owns this show.",
          },
          { status: 409 },
        ),
      ),
    );
    await expect(api("/api/shows/show/lease", {})).rejects.toEqual(
      new ApiError(
        "Another game tab currently owns this show.",
        409,
        "LEASE_HELD",
      ),
    );
    expect(vi.getTimerCount()).toBe(0);
  });

  it("allows a successful retry after a transient network failure", async () => {
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("Network request failed"))
      .mockResolvedValueOnce(Response.json({ show: { id: "preserved-show" } }));
    vi.stubGlobal("fetch", fetch);
    await expect(api("/api/shows/current")).rejects.toMatchObject({
      code: "NETWORK_ERROR",
    });
    await expect(api("/api/shows/current")).resolves.toEqual({
      show: { id: "preserved-show" },
    });
  });
});
