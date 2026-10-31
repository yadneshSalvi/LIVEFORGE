import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { LocalFileStore } from "@/server/store";
import {
  createShow,
  effectiveTwitchConnection,
  hostView,
  publicView,
  setTwitchHealth,
  showKey,
  type ShowRecord,
} from "@/server/show";
import { buildGenerationPrompt } from "@/server/generation";
let directory: string;
let store: LocalFileStore;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "liveforge-heartbeat-"));
  store = new LocalFileStore(directory);
  vi.stubEnv("SESSION_SECRET", "heartbeat-session-secret-123456789012");
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(directory, { recursive: true, force: true });
});
async function fixture() {
  const state = await createShow("host", "twitch", store);
  const show = (await store.get<ShowRecord>(showKey(state.id)))!;
  show.lease = {
    clientId: "active-host-tab",
    epoch: 1,
    expiresAt: Date.now() + 30_000,
  };
  show.twitch = {
    status: "connected",
    subscriptionId: "actual-subscription",
    lastHealthyAt: new Date().toISOString(),
    message: "Connected",
  };
  return show;
}
describe("persisted Twitch liveness", () => {
  it("derives a connection gap after70seconds without changing stored status or voting policy", async () => {
    const show = await fixture();
    show.votingOpen = false;
    show.twitch.lastHealthyAt = new Date(Date.now() - 70_001).toISOString();
    expect(hostView(show).twitch.status).toBe("gap");
    expect(publicView(show).twitch.status).toBe("gap");
    expect(publicView(show).votingOpen).toBe(false);
    expect(show.twitch.status).toBe("connected");
    expect(show.votingOpen).toBe(false);
  });
  it("derives a gap when authority expires even if the connector is still healthy", async () => {
    const show = await fixture();
    show.lease!.expiresAt = Date.now() - 1;
    expect(effectiveTwitchConnection(show).status).toBe("gap");
    expect(show.votingOpen).toBe(true);
    show.lease = null;
    expect(publicView(show).twitch.status).toBe("gap");
  });
  it("treats legacy connected records with no heartbeat as disconnected gaps", async () => {
    const show = await fixture();
    delete show.twitch.lastHealthyAt;
    expect(hostView(show).twitch.status).toBe("gap");
  });
  it("records healthy transport without reopening an intentionally closed round", async () => {
    const show = await fixture();
    show.votingOpen = false;
    show.twitch.status = "gap";
    show.twitch.lastHealthyAt = new Date(Date.now() - 90_000).toISOString();
    setTwitchHealth(show, "connected");
    expect(hostView(show).twitch.status).toBe("connected");
    expect(Date.parse(show.twitch.lastHealthyAt!)).toBeGreaterThan(
      Date.now() - 1000,
    );
    expect(show.votingOpen).toBe(false);
  });
  it("does not flood the evidence ledger with identical keepalive health events", async () => {
    const show = await fixture();
    const count = show.events.length;
    setTwitchHealth(show, "connected");
    setTwitchHealth(show, "connected");
    expect(show.events).toHaveLength(count);
  });
  it("does not restore revoked OAuth authorization using only a transport keepalive", async () => {
    const show = await fixture();
    show.twitch.status = "revoked";
    setTwitchHealth(show, "connected");
    expect(show.twitch.status).toBe("revoked");
    show.twitch.status = "gap";
    show.twitch.authorizationPaused = true;
    setTwitchHealth(show, "connected");
    expect(show.twitch.status).toBe("gap");
    expect(show.twitch.authorizationPaused).toBe(true);
  });
});
describe("future generated metadata", () => {
  it("requires plain performer language and exact seconds conversion without changing executable thresholds", () => {
    const prompt = buildGenerationPrompt(
      "After30ticks of stillness, cast a shadow.",
    );
    expect(prompt).toContain("RuleProgram.name and RuleProgram.description");
    expect(prompt).toContain("plain natural language");
    expect(prompt).toContain("30 ticks = half a second");
    expect(prompt).toContain("preserving the exact numeric tick thresholds");
    expect(prompt).toContain("Do not include raw field names");
  });
});
