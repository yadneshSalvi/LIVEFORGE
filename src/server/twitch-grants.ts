import { randomUUID } from "node:crypto";
import { assert, HttpError } from "./errors";
import { decryptToken, encryptToken } from "./security";
import { getStore } from "./store";

export type TokenGrant = {
  accessToken: string;
  refreshToken?: string;
  clientId?: string;
  userId: string;
  login: string;
  scopes: string[];
  expiresAt: number;
};
export type Credential = {
  ownerId: string;
  encrypted: string;
  createdAt: string;
  source?: "oauth-code";
  clientId?: string;
  lastValidatedAt?: number;
  status?: "ready" | "pending-validation" | "revoked";
  revokedAt?: number;
  rotationVersion?: number;
  retryAfter?: number;
  lock?: { owner: string; expiresAt: number };
};
export type ValidatedTwitchToken = {
  client_id: string;
  login: string;
  user_id: string;
  expires_in: number;
  scopes: string[];
};
const VALIDATION_INTERVAL = 60 * 60_000;
const REFRESH_READINESS = 60_000;
const LOCK_DURATION = 60_000;
export function twitchAppId() {
  assert(
    process.env.TWITCH_CLIENT_ID,
    503,
    "twitch_unconfigured",
    "The Twitch application has not been configured.",
  );
  return process.env.TWITCH_CLIENT_ID;
}
const unavailable = () =>
  new HttpError(
    503,
    "twitch_auth_unavailable",
    "Twitch authorization could not be checked. Intake is paused; retry shortly.",
  );
function reauthorize() {
  return new HttpError(
    401,
    "twitch_reauthorize",
    "Twitch authorization expired or was revoked. Reconnect your Twitch channel.",
  );
}
export async function validateTwitchToken(
  token: string,
): Promise<ValidatedTwitchToken> {
  let response: Response;
  try {
    response = await fetch("https://id.twitch.tv/oauth2/validate", {
      headers: { Authorization: "OAuth " + token },
      signal: AbortSignal.timeout(12_000),
      cache: "no-store",
    });
  } catch {
    throw unavailable();
  }
  if (response.status === 401) throw reauthorize();
  if (!response.ok) throw unavailable();
  let info: ValidatedTwitchToken;
  try {
    info = await response.json();
  } catch {
    throw unavailable();
  }
  assert(
    info.client_id === twitchAppId() &&
      typeof info.user_id === "string" &&
      /^\d{1,30}$/.test(info.user_id) &&
      typeof info.login === "string" &&
      Array.isArray(info.scopes) &&
      info.scopes.every((scope) => typeof scope === "string") &&
      info.scopes.includes("user:read:chat") &&
      Number.isFinite(info.expires_in) &&
      info.expires_in > 0,
    403,
    "twitch_scope",
    "Twitch authorization must belong to this app and include permission to read chat.",
  );
  return info;
}
function sameScopes(a: string[], b: string[]) {
  return (
    JSON.stringify([...new Set(a)].sort()) ===
    JSON.stringify([...new Set(b)].sort())
  );
}
function readGrant(record: Credential, ownerId: string): TokenGrant {
  assert(
    record.ownerId === ownerId,
    403,
    "twitch_grant",
    "This host does not own the Twitch grant.",
  );
  assert(
    !record.revokedAt && record.status !== "revoked",
    401,
    "twitch_reauthorize",
    "Twitch authorization expired or was revoked. Reconnect your Twitch channel.",
  );
  const grant = decryptToken<TokenGrant>(record.encrypted);
  assert(
    typeof grant.accessToken === "string" &&
      typeof grant.userId === "string" &&
      Array.isArray(grant.scopes) &&
      grant.scopes.includes("user:read:chat") &&
      Number.isFinite(grant.expiresAt),
    403,
    "twitch_grant",
    "The stored Twitch grant is invalid. Reconnect your Twitch channel.",
  );
  assert(
    (!record.clientId || record.clientId === twitchAppId()) &&
      (!grant.clientId || grant.clientId === twitchAppId()),
    403,
    "twitch_identity",
    "The stored Twitch grant belongs to another app. Reconnect your Twitch channel.",
  );
  return grant;
}
function fresh(record: Credential, grant: TokenGrant) {
  return (
    record.status !== "pending-validation" &&
    Boolean(
      record.lastValidatedAt &&
      record.lastValidatedAt > Date.now() - VALIDATION_INTERVAL,
    ) &&
    grant.expiresAt > Date.now() + REFRESH_READINESS
  );
}
async function saveFailure(id: string, nonce: string, error: unknown) {
  await getStore().update<Credential, void>(id, (record) => {
    if (record.lock?.owner !== nonce) return;
    if (
      error instanceof HttpError &&
      (error.status === 401 || error.status === 403)
    ) {
      record.status = "revoked";
      record.revokedAt = Date.now();
    } else record.retryAfter = Date.now() + 30_000;
    delete record.lock;
  });
}
/** One database-fenced maintainer validates/refreshes a grant; no process-only lock. */
export async function ensureOAuthGrant(
  id: string,
  ownerId: string,
  forceValidation = false,
  rejectedAccessToken?: string,
): Promise<TokenGrant> {
  const store = getStore();
  const nonce = randomUUID();
  const deadline = Date.now() + 15_000;
  let force = forceValidation || Boolean(rejectedAccessToken);
  for (;;) {
    const current = await store.get<Credential>(id);
    assert(
      current,
      403,
      "twitch_grant",
      "This host does not own the Twitch grant.",
    );
    const currentGrant = readGrant(current, ownerId);
    if (
      (!force ||
        (rejectedAccessToken &&
          currentGrant.accessToken !== rejectedAccessToken)) &&
      fresh(current, currentGrant)
    )
      return currentGrant;
    assert(
      !current.retryAfter || current.retryAfter <= Date.now(),
      503,
      "twitch_auth_unavailable",
      "Twitch authorization is temporarily unavailable. Retry shortly.",
    );
    const claimed = await store.update<Credential, boolean>(id, (record) => {
      readGrant(record, ownerId);
      if (record.lock && record.lock.expiresAt > Date.now()) return false;
      record.lock = { owner: nonce, expiresAt: Date.now() + LOCK_DURATION };
      return true;
    });
    if (!claimed) {
      assert(
        Date.now() < deadline,
        503,
        "twitch_auth_busy",
        "Twitch authorization is being renewed. Retry shortly.",
      );
      force = false;
      await new Promise((resolve) => setTimeout(resolve, 75));
      continue;
    }
    try {
      const locked = (await store.get<Credential>(id))!;
      let grant = readGrant(locked, ownerId);
      if (!force && fresh(locked, grant)) {
        await store.update<Credential, void>(id, (record) => {
          if (record.lock?.owner === nonce) delete record.lock;
        });
        return grant;
      }
      let mustRefresh =
        grant.accessToken === rejectedAccessToken ||
        grant.expiresAt <= Date.now() + REFRESH_READINESS;
      if (!mustRefresh) {
        try {
          const info = await validateTwitchToken(grant.accessToken);
          assert(
            info.user_id === grant.userId &&
              sameScopes(info.scopes, grant.scopes),
            403,
            "twitch_identity",
            "Twitch identity or permissions changed. Reconnect your Twitch channel.",
          );
          grant = {
            ...grant,
            clientId: twitchAppId(),
            login: info.login,
            scopes: info.scopes,
            expiresAt: Date.now() + info.expires_in * 1000,
          };
          await store.update<Credential, void>(id, (record) => {
            assert(
              record.lock?.owner === nonce &&
                record.lock.expiresAt > Date.now(),
              409,
              "twitch_auth_fenced",
              "A newer authorization maintainer took over. Retry shortly.",
            );
            record.encrypted = encryptToken(grant);
            record.lastValidatedAt = Date.now();
            record.status = "ready";
            delete record.retryAfter;
            delete record.lock;
          });
          return grant;
        } catch (error) {
          if (
            error instanceof HttpError &&
            error.status === 401 &&
            locked.status !== "pending-validation"
          )
            mustRefresh = true;
          else throw error;
        }
      }
      if (mustRefresh) {
        // Positive provenance marker is mandatory. Copied bootstrap/legacy grants never enter this branch.
        assert(
          locked.source === "oauth-code" &&
            locked.clientId === twitchAppId() &&
            grant.clientId === twitchAppId() &&
            typeof grant.refreshToken === "string" &&
            grant.refreshToken.length > 0,
          401,
          "twitch_reauthorize",
          "Reconnect Twitch once to enable automatic renewal for this independently authorized grant.",
        );
        assert(
          process.env.TWITCH_CLIENT_SECRET,
          503,
          "twitch_unconfigured",
          "The Twitch application secret is not configured.",
        );
        let response: Response;
        try {
          response = await fetch("https://id.twitch.tv/oauth2/token", {
            method: "POST",
            body: new URLSearchParams({
              client_id: twitchAppId(),
              client_secret: process.env.TWITCH_CLIENT_SECRET,
              grant_type: "refresh_token",
              refresh_token: grant.refreshToken,
            }),
            signal: AbortSignal.timeout(12_000),
            cache: "no-store",
          });
        } catch {
          throw unavailable();
        }
        if (response.status === 400 || response.status === 401)
          throw reauthorize();
        if (!response.ok) throw unavailable();
        let result: {
          access_token?: unknown;
          refresh_token?: unknown;
          expires_in?: unknown;
          scope?: unknown;
          token_type?: unknown;
        };
        try {
          result = await response.json();
        } catch {
          throw unavailable();
        }
        assert(
          typeof result.access_token === "string" &&
            result.access_token.length > 0 &&
            typeof result.refresh_token === "string" &&
            result.refresh_token.length > 0 &&
            typeof result.expires_in === "number" &&
            Number.isFinite(result.expires_in) &&
            result.expires_in > 0,
          502,
          "twitch_refresh_response",
          "Twitch did not return a complete renewed grant. Reconnect your channel.",
        );
        const scopes = Array.isArray(result.scope)
          ? result.scope.filter((s): s is string => typeof s === "string")
          : typeof result.scope === "string"
            ? result.scope.split(" ").filter(Boolean)
            : [];
        const originalScopes = grant.scopes;
        grant = {
          ...grant,
          accessToken: result.access_token,
          refreshToken: result.refresh_token,
          expiresAt: Date.now() + result.expires_in * 1000,
          scopes,
        };
        // Persist rotation BEFORE validation: a later validation failure cannot discard the only new refresh token.
        await store.update<Credential, void>(id, (record) => {
          assert(
            record.lock?.owner === nonce && record.lock.expiresAt > Date.now(),
            409,
            "twitch_auth_fenced",
            "A newer authorization maintainer took over. Retry shortly.",
          );
          record.encrypted = encryptToken(grant);
          record.status = "pending-validation";
          record.rotationVersion = (record.rotationVersion || 0) + 1;
        });
        assert(
          (!result.token_type ||
            String(result.token_type).toLowerCase() === "bearer") &&
            sameScopes(scopes, originalScopes),
          403,
          "twitch_scope",
          "Twitch permissions changed during renewal. Reconnect your channel.",
        );
        const info = await validateTwitchToken(grant.accessToken);
        assert(
          info.user_id === grant.userId &&
            sameScopes(info.scopes, originalScopes),
          403,
          "twitch_identity",
          "Twitch identity or permissions changed during renewal. Reconnect your channel.",
        );
        grant = {
          ...grant,
          login: info.login,
          scopes: info.scopes,
          expiresAt: Date.now() + info.expires_in * 1000,
        };
        await store.update<Credential, void>(id, (record) => {
          assert(
            record.lock?.owner === nonce && record.lock.expiresAt > Date.now(),
            409,
            "twitch_auth_fenced",
            "A newer authorization maintainer took over. Retry shortly.",
          );
          record.encrypted = encryptToken(grant);
          record.lastValidatedAt = Date.now();
          record.status = "ready";
          delete record.retryAfter;
          delete record.lock;
        });
        return grant;
      }
    } catch (error) {
      await saveFailure(id, nonce, error).catch(() => undefined);
      throw error;
    }
  }
}
