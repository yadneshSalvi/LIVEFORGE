import { randomBytes, randomUUID } from "node:crypto";
import { getStore } from "./store";
import { assert, HttpError } from "./errors";
import { digest, encryptToken, privateActor } from "./security";
import { event, ownedShow, rate, showKey, type ShowRecord } from "./show";

import {
  ensureOAuthGrant,
  twitchAppId as appId,
  validateTwitchToken,
  type TokenGrant,
  type Credential,
} from "./twitch-grants";
export { validateTwitchToken } from "./twitch-grants";
export type { ValidatedTwitchToken } from "./twitch-grants";
import {
  generationQuota,
  type GenerationIdentity,
  type GenerationQuotaView,
} from "./generation-quota";
const timeout = () => AbortSignal.timeout(12_000);
export function twitchRedirectUri() {
  const base = process.env.APP_BASE_URL;
  assert(
    base,
    503,
    "origin_unconfigured",
    "The application origin must be configured for Twitch authorization.",
  );
  return new URL("/api/auth/twitch/callback", base).toString();
}
export async function twitchLogin(
  showId: string,
  ownerId: string,
  writeChat = false,
) {
  const state = randomBytes(32).toString("base64url");
  await getStore().update<ShowRecord, void>(showKey(showId), (show) => {
    assert(
      show.ownerId === ownerId,
      404,
      "show_not_found",
      "Open your studio first.",
    );
    rate(show, "oauth", 6, 60_000);
    show.oauth = {
      stateHash: digest(state),
      writeChat,
      expiresAt: Date.now() + 10 * 60_000,
    };
  });
  const url = new URL("https://id.twitch.tv/oauth2/authorize");
  url.search = new URLSearchParams({
    client_id: appId(),
    redirect_uri: twitchRedirectUri(),
    response_type: "code",
    scope: writeChat ? "user:read:chat user:write:chat" : "user:read:chat",
    state,
    force_verify: "true",
  }).toString();
  return url.toString();
}
export async function twitchCallback(
  showId: string,
  ownerId: string,
  state: string,
  code: string,
) {
  assert(
    state.length >= 32 &&
      state.length <= 128 &&
      code.length > 0 &&
      code.length <= 512,
    400,
    "oauth_callback",
    "Invalid Twitch authorization callback.",
  );
  const writeChat = await getStore().update<ShowRecord, boolean>(
    showKey(showId),
    (show) => {
      assert(
        show.ownerId === ownerId &&
          show.oauth &&
          show.oauth.expiresAt > Date.now() &&
          show.oauth.stateHash === digest(state),
        403,
        "oauth_state",
        "Twitch authorization state expired or did not match this host session.",
      );
      const requestedWrite = show.oauth.writeChat === true;
      delete show.oauth;
      return requestedWrite;
    },
  );
  assert(
    process.env.TWITCH_CLIENT_SECRET,
    503,
    "twitch_unconfigured",
    "The Twitch application secret is not configured.",
  );
  const response = await fetch("https://id.twitch.tv/oauth2/token", {
    method: "POST",
    body: new URLSearchParams({
      client_id: appId(),
      client_secret: process.env.TWITCH_CLIENT_SECRET,
      code,
      grant_type: "authorization_code",
      redirect_uri: twitchRedirectUri(),
    }),
    signal: timeout(),
    cache: "no-store",
  });
  assert(
    response.ok,
    401,
    "oauth_exchange",
    "Twitch could not exchange this authorization. Start the connection again.",
  );
  const result = (await response.json()) as {
    access_token: string;
    refresh_token?: string;
  };
  assert(
    typeof result.access_token === "string",
    401,
    "oauth_exchange",
    "Twitch did not return an access grant.",
  );
  const info = await validateTwitchToken(result.access_token);
  assert(
    !writeChat || info.scopes.includes("user:write:chat"),
    403,
    "twitch_write_scope",
    "Chat replies require separate Twitch permission to write chat. Reauthorize with chat replies selected.",
  );
  const grant: TokenGrant = {
    clientId: appId(),
    accessToken: result.access_token,
    refreshToken: result.refresh_token,
    userId: info.user_id,
    login: info.login,
    scopes: info.scopes,
    expiresAt: Date.now() + info.expires_in * 1000,
  };
  const credentialId = "credential:" + randomUUID();
  await getStore().create<Credential>(credentialId, {
    ownerId,
    encrypted: encryptToken(grant),
    source: "oauth-code",
    clientId: appId(),
    lastValidatedAt: Date.now(),
    status: "ready",
    createdAt: new Date().toISOString(),
  });
  const hostAuthKey = "host-auth:" + ownerId;
  await getStore().create(hostAuthKey, { credentialId, userId: info.user_id });
  await getStore().update<{ credentialId: string; userId: string }, void>(
    hostAuthKey,
    (record) => {
      record.credentialId = credentialId;
      record.userId = info.user_id;
    },
  );
  await getStore().update<ShowRecord, void>(showKey(showId), (show) => {
    assert(show.ownerId === ownerId, 404, "show_not_found", "Show not found.");
    show.credentialId = credentialId;
    show.settings = {
      ...(show.settings || { blockedTerms: [] }),
      chatRepliesEnabled: false,
    };
    delete show.settings.chatRepliesEnabledAt;
    show.twitch = {
      status: "disconnected",
      channelId: info.user_id,
      channelLogin: info.login,
      message: "Connect chat",
    };
    event(
      show,
      "twitch.authorized",
      "The host authorized this Twitch channel.",
    );
  });
}
export async function authorizedGrant(show: ShowRecord): Promise<TokenGrant> {
  if (show.credentialId)
    return ensureOAuthGrant(show.credentialId, show.ownerId, true);
  // The copied grant is only a local development bootstrap, never a public deployment identity.
  assert(
    process.env.NODE_ENV !== "production" &&
      !process.env.VERCEL &&
      process.env.TWITCH_USER_ACCESS_TOKEN,
    401,
    "twitch_authorization_required",
    "Authorize your Twitch channel before connecting live chat.",
  );
  const accessToken = process.env.TWITCH_USER_ACCESS_TOKEN;
  const info = await validateTwitchToken(accessToken);
  assert(
    !process.env.TWITCH_USER_ID || info.user_id === process.env.TWITCH_USER_ID,
    403,
    "twitch_identity",
    "The development Twitch identity does not match the validated grant.",
  );
  return {
    accessToken,
    userId: info.user_id,
    login: info.login,
    scopes: info.scopes,
    expiresAt: Date.now() + info.expires_in * 1000,
  };
}
export async function connectTwitchSession(
  showId: string,
  ownerId: string,
  sessionId: string,
  reconnect = false,
) {
  assert(
    /^[A-Za-z0-9_=:.-]{8,300}$/.test(sessionId),
    400,
    "twitch_session",
    "Invalid EventSub WebSocket welcome session ID.",
  );
  const show = await ownedShow(showId, ownerId);
  assert(
    show.mode === "twitch",
    409,
    "practice_mode",
    "Live Twitch chat is available in Twitch studios.",
  );
  if (reconnect) {
    assert(
      show.twitch.subscriptionId && show.twitch.channelId,
      409,
      "twitch_reconnect",
      "A planned reconnect needs an established subscription.",
    );
    await getStore().update<ShowRecord, void>(showKey(showId), (current) => {
      assert(
        current.ownerId === ownerId,
        404,
        "show_not_found",
        "Show not found.",
      );
      current.twitch.sessionId = sessionId;
      current.twitch.lastHealthyAt = new Date().toISOString();
      current.twitch.status = "connected";
      current.twitch.message =
        "Twitch chat migrated to its replacement connection.";
    });
    return;
  }
  if (show.twitch.sessionId === sessionId && show.twitch.subscriptionId) return;
  let grant = await authorizedGrant(show);
  const channelId = show.credentialId
    ? grant.userId
    : process.env.TWITCH_BROADCASTER_ID || grant.userId;
  const subscribe = (accessToken: string) =>
    fetch("https://api.twitch.tv/helix/eventsub/subscriptions", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + accessToken,
        "Client-Id": appId(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        type: "channel.chat.message",
        version: "1",
        condition: { broadcaster_user_id: channelId, user_id: grant.userId },
        transport: { method: "websocket", session_id: sessionId },
      }),
      signal: timeout(),
      cache: "no-store",
    });
  let response = await subscribe(grant.accessToken);
  if (response.status === 401 && show.credentialId) {
    grant = await ensureOAuthGrant(
      show.credentialId,
      ownerId,
      false,
      grant.accessToken,
    );
    response = await subscribe(grant.accessToken);
  }

  if (response.status === 429)
    throw new HttpError(
      429,
      "twitch_rate_limit",
      "Twitch rate limited this connection. Wait before reconnecting.",
    );
  assert(
    response.status === 202,
    502,
    "twitch_subscribe",
    "Twitch did not establish the chat subscription. Open a fresh connection and reauthorize if needed.",
  );
  const result = (await response.json()) as { data: { id: string }[] };
  assert(
    result.data?.[0]?.id,
    502,
    "twitch_subscribe",
    "Twitch returned no subscription identifier.",
  );
  await getStore().update<ShowRecord, void>(showKey(showId), (current) => {
    assert(
      current.ownerId === ownerId,
      404,
      "show_not_found",
      "Show not found.",
    );
    current.twitch = {
      status: "connected",
      channelId,
      channelLogin: grant.login,
      sessionId,
      subscriptionId: result.data[0].id,
      lastHealthyAt: new Date().toISOString(),
      message: "Chat connected",
    };
    event(
      current,
      "twitch.connected",
      "The genuine Twitch chat subscription is connected.",
    );
  });
}

/** Only independently OAuth-authenticated hosts may request billable work, in every environment. */
async function generationIdentity(
  ownerId: string,
  forceValidation: boolean,
): Promise<GenerationIdentity> {
  const auth = await getStore().get<{ credentialId: string; userId: string }>(
    "host-auth:" + ownerId,
  );
  assert(
    auth,
    403,
    "generation_host_required",
    "Connect Twitch to forge — or load a sample law",
  );
  const grant = await ensureOAuthGrant(
    auth.credentialId,
    ownerId,
    forceValidation,
  );
  assert(
    grant.userId === auth.userId,
    403,
    "generation_host_required",
    "Twitch host identity changed. Authorize your Twitch account again.",
  );
  const exempt = (process.env.LIVEFORGE_GENERATION_HOST_IDS || "")
    .split(",")
    .map((id) => id.trim())
    .includes(grant.userId);
  return { actorId: privateActor("generation:" + grant.userId), exempt };
}
export async function requireGenerationHost(ownerId: string) {
  return generationIdentity(ownerId, true);
}
export async function generationAccess(ownerId: string | undefined): Promise<{
  allowed: boolean;
  authorization: string;
  quota: GenerationQuotaView | null;
}> {
  if (!ownerId)
    return {
      allowed: false,
      authorization: "Connect Twitch to forge",
      quota: null,
    };
  try {
    const identity = await generationIdentity(ownerId, false);
    const quota = await generationQuota(identity);
    return {
      allowed: !quota.exhausted,
      authorization: quota.exhausted
        ? "Daily forges used — load a sample law"
        : quota.exempt
          ? "Host connected"
          : `${quota.userRemaining} left today`,
      quota,
    };
  } catch (error) {
    return {
      allowed: false,
      authorization:
        error instanceof HttpError && error.code === "quota_configuration"
          ? error.message
          : "Reconnect Twitch to forge",
      quota: null,
    };
  }
}
export async function generationHostAllowed(ownerId: string | undefined) {
  return (await generationAccess(ownerId)).allowed;
}

/** Polling an active studio maintains hourly validation without a separate always-on daemon. */
export async function maintainTwitchSession(
  show: ShowRecord,
): Promise<ShowRecord> {
  if (
    !show.credentialId ||
    !(show.twitch.status === "connected" || show.twitch.authorizationPaused)
  )
    return show;
  try {
    await ensureOAuthGrant(show.credentialId, show.ownerId);
    if (!show.twitch.authorizationPaused) return show;
    await getStore().update<ShowRecord, void>(showKey(show.id), (current) => {
      if (
        current.credentialId === show.credentialId &&
        current.twitch.authorizationPaused
      ) {
        current.twitch.status = "connected";
        current.twitch.message = "Chat connected";
        delete current.twitch.authorizationPaused;
      }
    });
  } catch (error) {
    await getStore().update<ShowRecord, void>(showKey(show.id), (current) => {
      if (current.credentialId !== show.credentialId) return;
      const revoked =
        error instanceof HttpError &&
        (error.status === 401 || error.status === 403);
      current.twitch.status = revoked ? "revoked" : "gap";
      current.twitch.authorizationPaused = !revoked;
      current.twitch.message = revoked
        ? "Intake paused — reconnect Twitch"
        : "Intake paused — checking Twitch";
    });
  }
  return (await getStore().get<ShowRecord>(showKey(show.id)))!;
}
