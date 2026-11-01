import { CAPABILITY_HINT } from "@/lib/capabilities";
import { assert } from "./errors";
import { hashData, privateActor } from "./security";
import {
  event,
  effectiveTwitchConnection,
  showKey,
  type ShowRecord,
} from "./show";
import { getStore, type DocumentStore } from "./store";
import {
  ensureOAuthGrant,
  twitchAppId,
  type Credential,
  type TokenGrant,
} from "./twitch-grants";
import type { ShowEvent } from "./contracts";

/** Fixed templates only: model output, proposal text and private moderation reasons never enter chat. */
export function buildChatReply(
  show: ShowRecord,
  item: ShowEvent,
): string | null {
  const proposal = show.proposals.find((p) => p.id === item.proposalId);
  const mention = (name: string) => {
    const safe = name.replace(/[^\p{L}\p{N}_]/gu, "").slice(0, 25);
    return safe ? "@" + safe : "the community";
  };
  const alternativeCredit = (source: string | undefined) =>
    source === "model-suggested"
      ? "model-suggested, host-reviewed"
      : source === "host-written"
        ? "host-written"
        : source === "host-edited"
          ? "host-edited"
          : "host-reviewed";
  if (
    item.type === "proposal.received" &&
    proposal?.origin === "twitch" &&
    proposal.status !== "hidden" &&
    proposal.status !== "rejected"
  ) {
    if (proposal.ancestry?.kind === "adaptation")
      return `${proposal.id} is a ${alternativeCredit(proposal.ancestry.adaptationSource)} alternative to ${mention(proposal.ancestry.originalAuthor)}'s idea — !back ${proposal.id} to support it.`;
    return `${mention(proposal.author)} your idea is ${proposal.id} — !back ${proposal.id} to support it. ${CAPABILITY_HINT}`;
  }
  if (item.type === "generation.queued" && proposal)
    return `${proposal.id} is selected. Codex is forging the next law; the current game continues.`;
  if (item.type === "candidate.activated") {
    const candidate = show.candidates.find(
      (c) => c.id === item.candidateId && c.approvedAt,
    );
    const author = show.proposals.find((p) => p.id === candidate?.proposalId);
    if (candidate && author) {
      if (
        author.ancestry?.kind === "adaptation" ||
        author.ancestry?.adaptationSource
      )
        return `Law live — ${alternativeCredit(author.ancestry.adaptationSource)} alternative to ${mention(author.ancestry.originalAuthor)}'s idea${author.ancestry.kind === "library" ? " (reused verified source)" : ""}.`;
      if (
        author.origin === "sample" ||
        author.author === "Previously generated sample"
      )
        return "Law live — from a previously generated sample (reused verified source).";
      if (author.origin === "library")
        return `Law live — original idea by ${mention(author.ancestry?.originalAuthor || author.author)} (reused verified source).`;
      return `Law live — invented by ${mention(author.author)}.`;
    }
  }
  if (item.type === "generation.failed") {
    const job = [...show.jobs]
      .reverse()
      .find((j) => j.proposalId === item.proposalId);
    return job?.adaptedProposal
      ? "That idea needs an adaptation. The host can review a supported alternative; the original idea is preserved."
      : "That idea could not become a verified law this time. The current game is preserved.";
  }

  return null;
}
export async function requireChatReplyGrant(
  show: ShowRecord,
): Promise<TokenGrant> {
  assert(
    show.mode === "twitch" && show.credentialId,
    403,
    "chat_write_authorization",
    "Open a Twitch show and explicitly reauthorize chat replies first.",
  );
  const record = await getStore().get<Credential>(show.credentialId);
  assert(
    record?.source === "oauth-code" && record.ownerId === show.ownerId,
    403,
    "chat_write_authorization",
    "Chat replies require an independently authorized Twitch grant.",
  );
  const grant = await ensureOAuthGrant(show.credentialId, show.ownerId);
  assert(
    grant.scopes.includes("user:write:chat") &&
      grant.userId === show.twitch.channelId,
    403,
    "chat_write_authorization",
    "Reauthorize with permission to write chat before enabling replies for this channel.",
  );
  return grant;
}
export async function chatRepliesAuthorized(ownerId: string | undefined) {
  if (!ownerId) return false;
  try {
    const auth = await getStore().get<{ credentialId: string; userId: string }>(
      "host-auth:" + ownerId,
    );
    if (!auth) return false;
    const record = await getStore().get<Credential>(auth.credentialId);
    if (record?.source !== "oauth-code" || record.ownerId !== ownerId)
      return false;
    const grant = await ensureOAuthGrant(auth.credentialId, ownerId);
    return (
      grant.userId === auth.userId && grant.scopes.includes("user:write:chat")
    );
  } catch {
    return false;
  }
}
interface SenderRate {
  attempts: number[];
  blockedUntil: number;
}
export const REPLY_MIN_GAP_MS = 10_000;
export const REPLY_PER_MINUTE = 4;
const senderKey = (userId: string) =>
  "twitch-reply-rate:" + privateActor("reply-sender:" + userId);
/** Sender-wide, durable CAS budget shared by all shows and server instances. */
export async function reserveChatRate(
  userId: string,
  store: DocumentStore = getStore(),
  now = Date.now(),
) {
  const key = senderKey(userId);
  await store.create<SenderRate>(key, { attempts: [], blockedUntil: 0 });
  return store.update<SenderRate, boolean>(key, (rate) => {
    rate.attempts = rate.attempts.filter((at) => at > now - 60_000);
    if (
      rate.blockedUntil > now ||
      rate.attempts.length >= REPLY_PER_MINUTE ||
      (rate.attempts.length > 0 &&
        now - rate.attempts.at(-1)! < REPLY_MIN_GAP_MS)
    )
      return false;
    rate.attempts.push(now);
    return true;
  });
}
function resetTime(response: Response) {
  const now = Date.now();
  const retry = Number(response.headers.get("Retry-After"));
  const reset = Number(response.headers.get("Ratelimit-Reset")) * 1000;
  const candidate = Math.max(
    now + 60_000,
    Number.isFinite(retry) && retry > 0 ? now + retry * 1000 : 0,
    Number.isFinite(reset) ? reset : 0,
  );
  return Math.min(now + 24 * 60 * 60_000, candidate);
}
async function finish(
  showId: string,
  key: string,
  status: NonNullable<ShowRecord["replyDeliveries"]>[string]["status"],
  code?: string,
) {
  await getStore().update<ShowRecord, void>(showKey(showId), (show) => {
    const receipt = show.replyDeliveries?.[key];
    if (!receipt || receipt.status !== "reserved") return;
    receipt.status = status;
    if (code) receipt.code = code;
    event(
      show,
      "private.chat.delivery",
      status === "sent"
        ? "A restrained chat reply was sent."
        : status === "unknown"
          ? "A chat delivery has an unknown outcome and will not be retried."
          : status === "rate-limited"
            ? "A chat reply was suppressed by the shared sender rate limit."
            : "A chat reply was not sent.",
    );
  });
}
/** Best effort, at-most-one POST attempt per durable show event; an unknown network outcome is never retried. */
export async function deliverRecentChatReplies(showId: string) {
  try {
    const initial = await getStore().get<ShowRecord>(showKey(showId));
    if (
      !initial?.settings?.chatRepliesEnabled ||
      !initial.settings.chatRepliesEnabledAt ||
      effectiveTwitchConnection(initial).status !== "connected"
    )
      return;
    const enabledAt = Date.parse(initial.settings.chatRepliesEnabledAt);
    const pending = initial.events.filter(
      (item) =>
        Date.parse(item.at) >= enabledAt &&
        Date.parse(item.at) > Date.now() - 120_000 &&
        buildChatReply(initial, item),
    );
    for (const item of pending) {
      const key = hashData({ kind: "twitch-reply/v1", eventId: item.id });
      const reserved = await getStore().update<ShowRecord, boolean>(
        showKey(showId),
        (show) => {
          show.replyDeliveries ??= {};
          const now = Date.now();
          for (const [id, receipt] of Object.entries(show.replyDeliveries))
            if (receipt.at <= now - 600_000) delete show.replyDeliveries[id];
          const proposal = show.proposals.find((p) => p.id === item.proposalId);
          const userKey =
            item.type === "proposal.received" && proposal
              ? privateActor("reply-recipient:" + proposal.author.toLowerCase())
              : undefined;
          if (
            userKey &&
            Object.values(show.replyDeliveries).some(
              (r) => r.userKey === userKey && r.at > now - 60_000,
            )
          )
            return false;
          if (
            show.replyDeliveries[key] ||
            Object.keys(show.replyDeliveries).length >= 600 ||
            !show.settings?.chatRepliesEnabled ||
            show.settings.chatRepliesEnabledAt !==
              initial.settings.chatRepliesEnabledAt
          )
            return false;
          show.replyDeliveries[key] = {
            at: now,
            status: "reserved",
            ...(userKey ? { userKey } : {}),
          };
          return true;
        },
      );
      if (!reserved) continue;
      try {
        const show = (await getStore().get<ShowRecord>(showKey(showId)))!;
        if (
          !show.settings?.chatRepliesEnabled ||
          effectiveTwitchConnection(show).status !== "connected"
        ) {
          await finish(showId, key, "disabled");
          continue;
        }
        const grant = await requireChatReplyGrant(show);
        if (!(await reserveChatRate(grant.userId))) {
          await finish(showId, key, "rate-limited");
          continue;
        }
        // Recheck consent immediately before the side effect, after asynchronous authorization/rate work.
        const current = (await getStore().get<ShowRecord>(showKey(showId)))!;
        if (
          !current.settings?.chatRepliesEnabled ||
          current.credentialId !== show.credentialId
        ) {
          await finish(showId, key, "disabled");
          continue;
        }
        const message = buildChatReply(current, item);
        if (!message || message.length > 500) {
          await finish(showId, key, "disabled");
          continue;
        }
        const response = await fetch(
          "https://api.twitch.tv/helix/chat/messages",
          {
            method: "POST",
            headers: {
              Authorization: "Bearer " + grant.accessToken,
              "Client-Id": twitchAppId(),
              "Content-Type": "application/json",
            },
            // User-token requests must omit for_source_only; Twitch also forwards into linked Shared Chat sessions.
            body: JSON.stringify({
              broadcaster_id: grant.userId,
              sender_id: grant.userId,
              message,
            }),
            signal: AbortSignal.timeout(12_000),
            cache: "no-store",
          },
        );
        if (
          response.status === 429 ||
          response.headers.get("Ratelimit-Remaining") === "0"
        ) {
          const until = resetTime(response);
          await getStore().update<SenderRate, void>(
            senderKey(grant.userId),
            (rate) => {
              rate.blockedUntil = Math.max(rate.blockedUntil, until);
            },
          );
        }
        if (!response.ok) {
          await finish(
            showId,
            key,
            response.status === 429 ? "rate-limited" : "dropped",
            "http_" + response.status,
          );
          continue;
        }
        const data = (await response.json()) as {
          data?: Array<{ is_sent?: boolean; drop_reason?: { code?: unknown } }>;
        };
        const result = data.data?.[0];
        const code =
          typeof result?.drop_reason?.code === "string" &&
          /^[\w-]{1,60}$/.test(result.drop_reason.code)
            ? result.drop_reason.code
            : undefined;
        await finish(
          showId,
          key,
          result?.is_sent === true ? "sent" : "dropped",
          code,
        );
      } catch {
        await finish(showId, key, "unknown");
      }
    }
  } catch {
    /* Reply delivery never breaks the game, leaks a grant, or retries an uncertain send. */
  }
}
