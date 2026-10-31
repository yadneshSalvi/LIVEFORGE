import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { LocalFileStore } from "@/server/store";
import * as stores from "@/server/store";
import {
  POST as createStudio,
  GET as listStudios,
} from "@/app/api/shows/route";
import { POST as command } from "@/app/api/shows/[showId]/[...action]/route";
import { GET as oauthCallback } from "@/app/api/auth/twitch/callback/route";
import { unsign, type HostSession } from "@/server/security";
let directory: string;
let store: LocalFileStore;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "liveforge-api-"));
  store = new LocalFileStore(directory);
  vi.spyOn(stores, "getStore").mockReturnValue(store);
  vi.stubEnv("SESSION_SECRET", "api-test-session-secret-123456789012345");
  vi.stubEnv("APP_BASE_URL", "http://localhost:3100");
});
afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await rm(directory, { recursive: true, force: true });
});
function request(path: string, body: unknown, cookie?: string) {
  return new Request("http://localhost:3100" + path, {
    method: "POST",
    headers: {
      Origin: "http://localhost:3100",
      "Content-Type": "application/json",
      "x-idempotency-key": crypto.randomUUID(),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: JSON.stringify(body),
  });
}
const cookie = (response: Response) =>
  response.headers.get("set-cookie")!.split(";")[0];
describe("host studio HTTP authorization and resumption", () => {
  it("retains host identity across new studios and resumes an earlier studio through signed cookies", async () => {
    const first = await createStudio(
      request("/api/shows", { mode: "practice" }),
    );
    expect(first.status).toBe(201);
    const firstState = await first.json();
    const firstCookie = cookie(first);
    const firstSession = unsign<HostSession>(firstCookie.split("=")[1])!;
    const second = await createStudio(
      request("/api/shows", { mode: "twitch" }, firstCookie),
    );
    const secondCookie = cookie(second);
    const secondSession = unsign<HostSession>(secondCookie.split("=")[1])!;
    expect(secondSession.hostId).toBe(firstSession.hostId);
    expect(secondSession.showId).not.toBe(firstSession.showId);
    const listing = await listStudios(
      new Request("http://localhost:3100/api/shows", {
        headers: { Cookie: secondCookie },
      }),
    );
    expect((await listing.json()).shows).toHaveLength(2);
    const resumed = await command(
      request(`/api/shows/${firstSession.showId}/resume`, {}, secondCookie),
      {
        params: Promise.resolve({
          showId: firstSession.showId,
          action: ["resume"],
        }),
      },
    );
    expect(resumed.status).toBe(200);
    expect(unsign<HostSession>(cookie(resumed).split("=")[1])!.showId).toBe(
      firstState.show.id,
    );
  });
  it("never resumes another host's private show", async () => {
    const first = await createStudio(
      request("/api/shows", { mode: "practice" }),
    );
    const victim = (await first.json()).show;
    const intruder = await createStudio(
      request("/api/shows", { mode: "practice" }),
    );
    const denied = await command(
      request(`/api/shows/${victim.id}/resume`, {}, cookie(intruder)),
      { params: Promise.resolve({ showId: victim.id, action: ["resume"] }) },
    );
    expect(denied.status).toBe(404);
    expect(denied.headers.get("set-cookie")).toBeNull();
  });
  it("rejects absent same-origin evidence before creating a show", async () => {
    const response = await createStudio(
      new Request("http://localhost:3100/api/shows", {
        method: "POST",
        body: JSON.stringify({ mode: "practice" }),
      }),
    );
    expect(response.status).toBe(403);
  });
  it("redirects failed OAuth back to a friendly studio URL without callback secrets", async () => {
    const studio = await createStudio(
      request("/api/shows", { mode: "twitch" }),
    );
    const response = await oauthCallback(
      new Request(
        "http://localhost:3100/api/auth/twitch/callback?state=wrong&code=confidential-code-fixture",
        { headers: { Cookie: cookie(studio) } },
      ),
    );
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "http://localhost:3100/studio?authError=oauth_callback",
    );
    expect(response.headers.get("location")).not.toContain("confidential-code");
  });
});
