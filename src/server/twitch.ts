import { randomBytes, randomUUID } from "node:crypto";
import { getStore } from "./store";
import { assert, HttpError } from "./errors";
import { digest, encryptToken } from "./security";
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
export async function twitchLogin(showId: string, ownerId: string) {
  const state = randomBytes(32).toString("base64url");
  await getStore().update<ShowRecord, void>(showKey(showId), (show) => {
    assert(
      show.ownerId === ownerId && show.mode === "twitch",
      404,
      "show_not_found",
      "Open your Twitch studio first.",
    );
    rate(show, "oauth", 6, 60_000);
    show.oauth = {
      stateHash: digest(state),
      expiresAt: Date.now() + 10 * 60_000,
    };
  });
  const url = new URL("https://id.twitch.tv/oauth2/authorize");
  url.search = new URLSearchParams({
    client_id: appId(),
    redirect_uri: twitchRedirectUri(),
    response_type: "code",
    scope: "user:read:chat",
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
  await getStore().update<ShowRecord, void>(showKey(showId), (show) => {
    assert(
      show.ownerId === ownerId &&
        show.oauth &&
        show.oauth.expiresAt > Date.now() &&
        show.oauth.stateHash === digest(state),
      403,
      "oauth_state",
      "Twitch authorization state expired or did not match this host session.",
    );
    delete show.oauth;
  });
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
    show.twitch = {
      status: "disconnected",
      channelId: info.user_id,
      channelLogin: info.login,
      message:
        "Twitch is authorized. Connect chat to open the live proposal board.",
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
      message:
        "Receiving real Twitch chat through the host browser connection.",
    };
    event(
      current,
      "twitch.connected",
      "The genuine Twitch chat subscription is connected.",
    );
  });
}

/** Production billable work is limited to explicitly allowed OAuth-authenticated hosts. */
export async function requireGenerationHost(ownerId: string) {
  if (process.env.NODE_ENV !== "production" && !process.env.VERCEL) return;
  const allowed = (process.env.LIVEFORGE_GENERATION_HOST_IDS || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  const auth = await getStore().get<{ credentialId: string; userId: string }>(
    "host-auth:" + ownerId,
  );
  assert(
    auth && allowed.includes(auth.userId),
    403,
    "generation_host_required",
    "Live generation is reserved for an authorized show host. Connect the invited Twitch channel, or explore the labeled practice mechanic.",
  );
  const grant = await ensureOAuthGrant(auth.credentialId, ownerId, true);
  assert(
    grant.userId === auth.userId,
    403,
    "generation_host_required",
    "Twitch host identity changed. Authorize the invited host account again.",
  );
}

export async function generationHostAllowed(
  ownerId: string | undefined,
): Promise<boolean> {
  if (process.env.NODE_ENV !== "production" && !process.env.VERCEL) return true;
  if (!ownerId) return false;
  const auth = await getStore().get<{ credentialId: string; userId: string }>(
    "host-auth:" + ownerId,
  );
  if (
    !auth ||
    !(process.env.LIVEFORGE_GENERATION_HOST_IDS || "")
      .split(",")
      .map((id) => id.trim())
      .includes(auth.userId)
  )
    return false;
  try {
    const grant = await ensureOAuthGrant(auth.credentialId, ownerId);
    return grant.userId === auth.userId;
  } catch {
    return false;
  }
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
        current.twitch.message =
          "Twitch authorization verified. Receiving genuine chat events.";
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
        ? "Twitch authorization was revoked. Reconnect your channel; live intake is paused."
        : "Twitch authorization could not be checked. Live intake is paused until it recovers.";
    });
  }
  return (await getStore().get<ShowRecord>(showKey(show.id)))!;
}
