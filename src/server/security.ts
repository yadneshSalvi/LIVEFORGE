import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { HttpError, assert } from "./errors";
export const SESSION_COOKIE = "liveforge_host";
export type HostSession = { hostId: string; showId: string; expiresAt: number };
function secret() {
  const value = process.env.SESSION_SECRET;
  assert(
    value && value.length >= 32,
    503,
    "session_unconfigured",
    "Session signing must be configured.",
  );
  return value;
}
export function digest(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
/** Stable across PostgreSQL JSONB key ordering and browser object construction order. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value))
    return "[" + value.map(canonicalJson).join(",") + "]";
  const object = value as Record<string, unknown>;
  return (
    "{" +
    Object.keys(object)
      .filter((key) => object[key] !== undefined)
      .sort()
      .map((key) => JSON.stringify(key) + ":" + canonicalJson(object[key]))
      .join(",") +
    "}"
  );
}
export function hashData(value: unknown) {
  return digest(canonicalJson(value));
}
export function privateActor(id: string) {
  return createHmac("sha256", secret())
    .update("twitch:" + id)
    .digest("hex");
}
export function sign(value: unknown) {
  const data = Buffer.from(JSON.stringify(value)).toString("base64url");
  return (
    data + "." + createHmac("sha256", secret()).update(data).digest("base64url")
  );
}
export function unsign<T>(value: string | undefined): T | null {
  if (!value || value.length > 4096) return null;
  const [data, signature, ...extra] = value.split(".");
  if (!signature || extra.length) return null;
  const expected = createHmac("sha256", secret())
    .update(data)
    .digest("base64url");
  if (
    signature.length !== expected.length ||
    !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  )
    return null;
  try {
    return JSON.parse(Buffer.from(data, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}
export function cookieValue(request: Request, name = SESSION_COOKIE) {
  return request.headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(name + "="))
    ?.slice(name.length + 1);
}
export function session(request: Request): HostSession {
  const result = unsign<HostSession>(cookieValue(request));
  assert(
    result &&
      typeof result.hostId === "string" &&
      typeof result.showId === "string" &&
      result.expiresAt > Date.now(),
    401,
    "sign_in",
    "Create or resume a host studio first.",
  );
  return result;
}
export function sessionCookie(value: HostSession) {
  return `${SESSION_COOKIE}=${sign(value)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000${process.env.NODE_ENV === "production" ? "; Secure" : ""}`;
}
export function requireSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const configured = new URL(process.env.APP_BASE_URL || request.url).origin;
  assert(
    origin === configured,
    403,
    "origin",
    "This command must come from the host studio origin.",
  );
  assert(
    request.headers.get("sec-fetch-site") !== "cross-site",
    403,
    "origin",
    "Cross-site commands are not allowed.",
  );
}
export async function jsonBody(
  request: Request,
): Promise<Record<string, unknown>> {
  assert(
    Number(request.headers.get("content-length") || 0) <= 128_000,
    413,
    "body_too_large",
    "Request is too large.",
  );
  const reader = request.body?.getReader();
  let size = 0;
  const chunks: Uint8Array[] = [];
  if (reader) {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 128_000) {
        await reader.cancel();
        throw new HttpError(413, "body_too_large", "Request is too large.");
      }
      chunks.push(value);
    }
  }
  try {
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
    assert(
      body && typeof body === "object" && !Array.isArray(body),
      400,
      "invalid_body",
      "Expected a JSON object.",
    );
    return body;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, "invalid_json", "Invalid JSON body.");
  }
}
function encryptionKey() {
  const value = process.env.TOKEN_ENCRYPTION_KEY;
  const key = Buffer.from(value || "", "base64");
  assert(
    key.length === 32,
    503,
    "encryption_unconfigured",
    "Token encryption must be configured.",
  );
  return key;
}
export function encryptToken(value: unknown) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const data = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), data]).toString("base64url");
}
export function decryptToken<T>(value: string): T {
  const data = Buffer.from(value, "base64url");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    data.subarray(0, 12),
  );
  decipher.setAuthTag(data.subarray(12, 28));
  return JSON.parse(
    Buffer.concat([
      decipher.update(data.subarray(28)),
      decipher.final(),
    ]).toString("utf8"),
  ) as T;
}
export function jsonError(error: unknown) {
  if (error instanceof HttpError)
    return Response.json(
      { error: error.code, message: error.message },
      { status: error.status, headers: { "Cache-Control": "no-store" } },
    );
  console.error(
    "LIVEFORGE request failed",
    error instanceof Error ? error.name : "unknown",
  );
  return Response.json(
    {
      error: "unavailable",
      message:
        "The service could not complete this command. Your active game is preserved.",
    },
    { status: 503 },
  );
}
