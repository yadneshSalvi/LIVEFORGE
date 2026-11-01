import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalFileStore } from "@/server/store";
import * as stores from "@/server/store";
import {
  acquireLease,
  addProposal,
  createShow,
  event,
  hostView,
  ingestTwitch,
  moderateProposal,
  publicView,
  showKey,
  updateShowSettings,
  vote,
  type ShowRecord,
} from "@/server/show";
import {
  buildChatReply,
  deliverRecentChatReplies,
  requireChatReplyGrant,
  reserveChatRate,
} from "@/server/twitch-replies";
import { twitchCallback, twitchLogin } from "@/server/twitch";
import { encryptToken } from "@/server/security";
let directory: string;
let store: LocalFileStore;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "liveforge-replies-"));
  store = new LocalFileStore(directory);
  vi.spyOn(stores, "getStore").mockReturnValue(store);
  vi.stubEnv("SESSION_SECRET", "replies-session-secret-123456789012345");
  vi.stubEnv("TOKEN_ENCRYPTION_KEY", Buffer.alloc(32, 47).toString("base64"));
  vi.stubEnv("TWITCH_CLIENT_ID", "fixture-app");
  vi.stubEnv("TWITCH_CLIENT_SECRET", "fixture-secret");
  vi.stubEnv("APP_BASE_URL", "http://localhost:3100");
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      Response.json({
        data: [{ is_sent: true, message_id: "sent-fixture" }],
      }),
    ),
  );
});
afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  await rm(directory, { recursive: true, force: true });
});
async function fixture(owner = "owner", write = true) {
  const state = await createShow(owner, "twitch", store);
  const show = (await store.get<ShowRecord>(showKey(state.id)))!;
  acquireLease(show, "client-fixture");
  show.twitch = {
    status: "connected",
    lastHealthyAt: new Date().toISOString(),
    channelId: "123",
    subscriptionId: "subscription-fixture",
    message: "Connected",
  };
  show.credentialId = "credential:" + owner;
  await store.create(show.credentialId, {
    ownerId: owner,
    source: "oauth-code",
    clientId: "fixture-app",
    status: "ready",
    lastValidatedAt: Date.now(),
    createdAt: new Date().toISOString(),
    encrypted: encryptToken({
      clientId: "fixture-app",
      accessToken: "fixture-private-access",
      refreshToken: "fixture-private-refresh",
      userId: "123",
      login: "fixture-host",
      scopes: write
        ? ["user:read:chat", "user:write:chat"]
        : ["user:read:chat"],
      expiresAt: Date.now() + 3600000,
    }),
  });
  return show;
}
async function persist(show: ShowRecord) {
  await store.update<ShowRecord, void>(showKey(show.id), (s) =>
    Object.assign(s, show),
  );
}
function notification(
  text: string,
  id = "fixture-message",
  badges?: Array<{ set_id: string; id: string; info: string }>,
) {
  return {
    metadata: {
      message_id: "delivery-" + id,
      message_type: "notification",
      message_timestamp: new Date().toISOString(),
      subscription_type: "channel.chat.message",
    },
    payload: {
      subscription: {
        id: "subscription-fixture",
        type: "channel.chat.message",
        condition: { broadcaster_user_id: "123", user_id: "123" },
      },
      event: {
        broadcaster_user_id: "123",
        chatter_user_id: "456",
        chatter_user_name: "RealViewer",
        message_id: id,
        message: { text },
        badges,
      },
    },
  };
}
function enable(show: ShowRecord) {
  updateShowSettings(show, { chatRepliesEnabled: true });
  addProposal(
    show,
    "Jumping briefly makes the courier glow.",
    "RealViewer",
    "viewer",
    "twitch",
  );
}
describe("Twitch moderation and private settings", () => {
  it("normalizes bounded host terms and preserves dedup for refused ideas without publishing reasons", async () => {
    const show = await fixture();
    updateShowSettings(show, {
      blockedTerms: ["  Secret WORD  ", "secret word"],
    });
    const data = notification("!forge A SECRET WORD causes the lamp to glow.");
    expect(ingestTwitch(show, data)).toEqual({ refused: true });
    expect(ingestTwitch(show, data)).toEqual({ duplicate: true });
    expect(show.proposals).toEqual([]);
    expect(show.settings.blockedTerms).toEqual(["secret word"]);
    expect(publicView(show)).not.toHaveProperty("settings");
    expect(() =>
      updateShowSettings(show, { blockedTerms: Array(41).fill("too many") }),
    ).toThrow(/forty/);
    expect(() => updateShowSettings(show, { blockedTerms: ["x"] })).toThrow(
      /2–60/,
    );
  });
  it("accepts a lead moderator badge", async () => {
    const show = await fixture();
    ingestTwitch(
      show,
      notification("!forge Jumping briefly makes the courier glow."),
    );
    expect(
      ingestTwitch(
        show,
        notification("!hide P1", "lead-mod", [
          { set_id: "lead_moderator", id: "1", info: "" },
        ]),
      ),
    ).toEqual({ moderated: true, proposalId: "P1" });
    expect(publicView(show).proposals).toEqual([]);
  });
  it("suppresses a thousand refusals and prunes expired receipts before a valid reply", async () => {
    const show = await fixture();
    updateShowSettings(show, { chatRepliesEnabled: true });
    for (let i = 0; i < 1000; i++) {
      expect(
        ingestTwitch(show, notification("!forge x", "refused-" + i)),
      ).toEqual({ refused: true });
      expect(buildChatReply(show, show.events.at(-1)!)).toBeNull();
    }
    show.replyDeliveries = Object.fromEntries(
      Array.from({ length: 600 }, (_, i) => [
        String(i),
        { at: Date.now() - 600001, status: "sent" as const },
      ]),
    );
    const p = addProposal(
      show,
      "Wind gently pushes the courier.",
      "RealViewer",
      "viewer",
      "twitch",
    );
    const reply = buildChatReply(
      show,
      show.events.find(
        (e) => e.type === "proposal.received" && e.proposalId === p.id,
      )!,
    );
    expect(reply).toContain(
      "gravity, jump strength, air jumps, size, wind, spawned platforms or props, shadows, and timers",
    );
    await persist(show);
    await deliverRecentChatReplies(show.id);
    expect(fetch).toHaveBeenCalledOnce();
    expect(
      Object.keys(
        (await store.get<ShowRecord>(showKey(show.id)))!.replyDeliveries!,
      ),
    ).toHaveLength(1);
  });
  it("applies a durable per-viewer cooldown without consuming additional receipts", async () => {
    const show = await fixture();
    enable(show);
    addProposal(
      show,
      "Wind pushes the courier sideways.",
      "RealViewer",
      "viewer",
      "twitch",
    );
    await persist(show);
    await deliverRecentChatReplies(show.id);
    expect(fetch).toHaveBeenCalledOnce();
    expect(
      Object.keys(
        (await store.get<ShowRecord>(showKey(show.id)))!.replyDeliveries!,
      ),
    ).toHaveLength(1);
  });
  it("accepts hide/reject only from EventSub moderator or broadcaster badges and strips the private explanation", async () => {
    const show = await fixture();
    ingestTwitch(
      show,
      notification("!forge Jumping briefly makes the courier glow."),
    );
    vote(show, "P1", "backer");
    expect(ingestTwitch(show, notification("!reject P1", "non-mod"))).toEqual({
      ignored: true,
      reason: "moderator_required",
    });
    expect(show.proposals[0].status).toBe("open");
    expect(
      ingestTwitch(
        show,
        notification("!reject P1", "mod", [
          { set_id: "moderator", id: "1", info: "" },
        ]),
      ),
    ).toEqual({ moderated: true, proposalId: "P1" });
    expect(show.voters).toEqual({});
    expect(show.proposals[0].votes).toBe(0);
    expect(() => vote(show, "P1", "new-backer")).toThrow(/not found/);
    moderateProposal(
      show,
      "P1",
      "rejected",
      "private investigation detail sk-fixture-private",
    );
    expect(JSON.stringify(publicView(show))).not.toContain(
      "private investigation",
    );
    expect(publicView(show).proposals[0].status).toBe("rejected");
    ingestTwitch(
      show,
      notification("!hide P1", "broadcaster", [
        { set_id: "broadcaster", id: "1", info: "" },
      ]),
    );
    expect(publicView(show).proposals).toEqual([]);
  });
  it("requests separate write reconsent, binds it to single-use state and keeps replies off after callback", async () => {
    const show = await fixture();
    await persist(show);
    const readURL = new URL(await twitchLogin(show.id, show.ownerId));
    expect(readURL.searchParams.get("scope")).toBe("user:read:chat");
    const writeURL = new URL(await twitchLogin(show.id, show.ownerId, true));
    expect(writeURL.searchParams.get("scope")).toBe(
      "user:read:chat user:write:chat",
    );
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        Response.json({
          access_token: "new-fixture-access",
          refresh_token: "new-fixture-refresh",
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          client_id: "fixture-app",
          login: "fixture-host",
          user_id: "123",
          expires_in: 3600,
          scopes: ["user:read:chat"],
        }),
      );
    await expect(
      twitchCallback(
        show.id,
        show.ownerId,
        writeURL.searchParams.get("state")!,
        "fixture-code",
      ),
    ).rejects.toThrow(/separate Twitch permission/);
    const retryURL = new URL(await twitchLogin(show.id, show.ownerId, true));
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        Response.json({
          access_token: "new-fixture-access",
          refresh_token: "new-fixture-refresh",
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          client_id: "fixture-app",
          login: "fixture-host",
          user_id: "123",
          expires_in: 3600,
          scopes: ["user:read:chat", "user:write:chat"],
        }),
      );
    await twitchCallback(
      show.id,
      show.ownerId,
      retryURL.searchParams.get("state")!,
      "fixture-code",
    );
    expect(
      (await store.get<ShowRecord>(showKey(show.id)))!.settings
        .chatRepliesEnabled,
    ).toBe(false);
    await expect(
      twitchCallback(
        show.id,
        show.ownerId,
        retryURL.searchParams.get("state")!,
        "fixture-code",
      ),
    ).rejects.toThrow(/state expired/);
  });
});
describe("optional restrained server replies", () => {
  it("reserves before POST across competing drains and never exposes grants, receipts, model text or reasons", async () => {
    const show = await fixture();
    enable(show);
    show.proposals[0].text = "unique private model-like proposal contents";
    await persist(show);
    await Promise.all(
      Array.from({ length: 6 }, () => deliverRecentChatReplies(show.id)),
    );
    expect(fetch).toHaveBeenCalledOnce();
    const [url, options] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("https://api.twitch.tv/helix/chat/messages");
    const message = JSON.parse(String(options!.body));
    expect(message).toMatchObject({ sender_id: "123", broadcaster_id: "123" });
    expect(message).not.toHaveProperty("for_source_only");
    expect(message.message).toContain("P1");
    expect(message.message).not.toContain(show.proposals[0].text);
    const saved = (await store.get<ShowRecord>(showKey(show.id)))!;
    expect(Object.values(saved.replyDeliveries!)[0].status).toBe("sent");
    expect(hostView(saved)).not.toHaveProperty("replyDeliveries");
    expect(JSON.stringify(publicView(saved))).not.toContain(
      "fixture-private-access",
    );
  });
  it("never retries a POST with an unknown network outcome, even on another durable store instance", async () => {
    const show = await fixture();
    enable(show);
    await persist(show);
    vi.mocked(fetch).mockRejectedValue(new Error("fixture lost response"));
    await deliverRecentChatReplies(show.id);
    vi.spyOn(stores, "getStore").mockReturnValue(new LocalFileStore(directory));
    await deliverRecentChatReplies(show.id);
    expect(fetch).toHaveBeenCalledOnce();
    expect(
      Object.values(
        (await store.get<ShowRecord>(showKey(show.id)))!.replyDeliveries!,
      )[0].status,
    ).toBe("unknown");
  });
  it("requires independent write authorization and stops immediately when disabled or revoked", async () => {
    const readOnly = await fixture("read-only", false);
    enable(readOnly);
    await persist(readOnly);
    await expect(requireChatReplyGrant(readOnly)).rejects.toThrow(
      /permission to write/,
    );
    await deliverRecentChatReplies(readOnly.id);
    expect(fetch).not.toHaveBeenCalled();
    const disabled = await fixture("disabled");
    enable(disabled);
    updateShowSettings(disabled, { chatRepliesEnabled: false });
    await persist(disabled);
    await deliverRecentChatReplies(disabled.id);
    expect(fetch).not.toHaveBeenCalled();
    const revoked = await fixture("revoked");
    enable(revoked);
    await persist(revoked);
    await store.update<{ status: string }, void>(revoked.credentialId!, (c) => {
      c.status = "revoked";
    });
    await deliverRecentChatReplies(revoked.id);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("uses one durable sender rate across shows and bounds receipts without truncating dedup history", async () => {
    const first = await fixture("first");
    enable(first);
    await persist(first);
    const second = await fixture("second");
    enable(second);
    await persist(second);
    await Promise.all([
      deliverRecentChatReplies(first.id),
      deliverRecentChatReplies(second.id),
    ]);
    expect(fetch).toHaveBeenCalledOnce();
    const now = Date.now();
    expect(await reserveChatRate("456", store, now)).toBe(true);
    expect(await reserveChatRate("456", store, now + 9999)).toBe(false);
    expect(await reserveChatRate("456", store, now + 10000)).toBe(true);
    expect(await reserveChatRate("456", store, now + 20000)).toBe(true);
    expect(await reserveChatRate("456", store, now + 30000)).toBe(true);
    expect(await reserveChatRate("456", store, now + 40000)).toBe(false);
    expect(await reserveChatRate("456", store, now + 60001)).toBe(true);
  });
  it("inspects is_sent/drop_reason and honors 429 Retry-After and reset without resending", async () => {
    const dropped = await fixture("dropped");
    enable(dropped);
    await persist(dropped);
    vi.mocked(fetch).mockResolvedValueOnce(
      Response.json({
        data: [
          {
            is_sent: false,
            drop_reason: {
              code: "automod_held",
              message: "private provider detail",
            },
          },
        ],
      }),
    );
    await deliverRecentChatReplies(dropped.id);
    expect(
      Object.values(
        (await store.get<ShowRecord>(showKey(dropped.id)))!.replyDeliveries!,
      )[0],
    ).toMatchObject({ status: "dropped", code: "automod_held" });
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now + 61000);
    const limited = await fixture("limited");
    enable(limited);
    await persist(limited);
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(null, {
        status: 429,
        headers: {
          "Retry-After": "120",
          "Ratelimit-Reset": String(Math.floor((now + 181000) / 1000)),
        },
      }),
    );
    await deliverRecentChatReplies(limited.id);
    expect(await reserveChatRate("123", store, now + 122000)).toBe(false);
    await deliverRecentChatReplies(limited.id);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it.each([
    ["sample", "Previously generated sample", "Sample law live"],
    ["practice", "Previously generated sample", "Sample law live"],
    [
      "library",
      "Library importer",
      "Law live — original idea by @OriginalContributor · Sample.",
    ],
    ["twitch", "ActualViewer", "Law live — invented by @ActualViewer."],
  ] as const)(
    "uses truthful fixed activation credit for %s/%s",
    async (origin, author, expected) => {
      const show = await fixture();
      const proposal = addProposal(
        show,
        "Nearby props glow while the courier walks.",
        author,
        "credit-fixture",
        origin,
      );
      if (origin === "library")
        proposal.ancestry = {
          kind: "library",
          originalAuthor: "OriginalContributor",
          originalText: "PRIVATE ORIGINAL IDEA",
        };
      // Only template fields are needed; this is not an approval or provider fixture.
      const candidate = {
        id: "activation-template-fixture",
        proposalId: proposal.id,
        approvedAt: new Date().toISOString(),
      } as ShowRecord["candidates"][number];
      show.candidates.push(candidate);
      event(show, "candidate.activated", "SYNTHETIC TEMPLATE EVENT", {
        candidateId: candidate.id,
      });
      const reply = buildChatReply(show, show.events.at(-1)!);
      expect(reply).toBe(expected);
      expect(reply).not.toContain("@Previouslygeneratedsample");
      expect(reply).not.toContain("PRIVATE");
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it("builds only fixed neutral refusal/adaptation text", async () => {
    const show = await fixture();
    event(show, "generation.failed", "PRIVATE RAW ERROR", { proposalId: "P1" });
    const item = show.events.at(-1)!;
    expect(buildChatReply(show, item)).not.toContain("PRIVATE");
    expect(buildChatReply(show, item)).toBe("Forge failed — try another idea");
  });

  it("credits a suggested alternative without model wording", async () => {
    const show = await fixture();
    const p = addProposal(
      show,
      "Wind gently pushes the courier.",
      "RealViewer",
      "viewer",
      "twitch",
    );
    p.ancestry = {
      kind: "adaptation",
      adaptationSource: "model-suggested",
      originalAuthor: "OriginalViewer",
      originalText: "PRIVATE ORIGINAL",
    };
    const reply = buildChatReply(
      show,
      show.events.find(
        (e) => e.type === "proposal.received" && e.proposalId === p.id,
      )!,
    );
    expect(reply).toBe(
      `${p.id} is a suggested, host-reviewed alternative to @OriginalViewer's idea — !back ${p.id} to support it.`,
    );
    expect(reply).not.toMatch(/model|PRIVATE/i);
  });
});
