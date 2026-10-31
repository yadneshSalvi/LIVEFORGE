import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "../src/proxy";

afterEach(() => vi.unstubAllEnvs());
const canonical = "https://liveforge-iota.vercel.app";
function production() {
  vi.stubEnv("VERCEL_ENV", "production");
  vi.stubEnv("APP_BASE_URL", canonical);
}

describe("canonical production origin", () => {
  it("redirects alias pages and OAuth callbacks to the configured origin preserving path and query", () => {
    production();
    for (const path of [
      "/studio?show=fixture",
      "/api/auth/twitch/callback?code=fixture&state=fixture",
    ]) {
      const response = proxy(
        new NextRequest("https://liveforge-alias.vercel.app" + path),
      );
      expect(response.status).toBe(308);
      expect(response.headers.get("location")).toBe(canonical + path);
    }
  });

  it("does not redirect canonical, preview or localhost requests", () => {
    production();
    expect(
      proxy(new NextRequest(canonical + "/studio")).headers.get("location"),
    ).toBeNull();
    vi.stubEnv("VERCEL_ENV", "preview");
    expect(
      proxy(new NextRequest("https://preview.vercel.app/studio")).headers.get(
        "location",
      ),
    ).toBeNull();
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("APP_BASE_URL", "http://localhost:3100");
    expect(
      proxy(new NextRequest("http://localhost:3100/studio")).headers.get(
        "location",
      ),
    ).toBeNull();
  });

  it("rejects alias mutations rather than forwarding a host command between origins", async () => {
    production();
    const response = proxy(
      new NextRequest("https://alias.vercel.app/api/shows/fixture/activate", {
        method: "POST",
        body: "fixture",
      }),
    );
    expect(response.status).toBe(403);
    expect(response.headers.get("location")).toBeNull();
    expect(await response.json()).toMatchObject({
      error: "canonical_origin",
      studioUrl: canonical + "/studio",
    });
  });
});
