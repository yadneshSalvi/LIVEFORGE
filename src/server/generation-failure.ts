/** The guest's error text is untrusted. Redact again on the server before any host-visible persistence. */
export function sanitizeGenerationFailure(value: unknown): string | null {
  if (typeof value !== "string") return null;
  let text = value
    .slice(0, 4000)
    .replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, " ");
  for (const name of [
    "OPENAI_API_KEY",
    "CODEX_API_KEY",
    "TWITCH_CLIENT_SECRET",
    "TWITCH_USER_ACCESS_TOKEN",
    "TWITCH_USER_REFRESH_TOKEN",
    "SESSION_SECRET",
    "TOKEN_ENCRYPTION_KEY",
    "VERCEL_TOKEN",
    "VERCEL_OIDC_TOKEN",
    "DATABASE_URL",
  ]) {
    const secret = process.env[name];
    if (secret && secret.length >= 8)
      text = text.split(secret).join("[redacted]");
  }
  text = text
    .replace(/\b(?:Bearer|OAuth)\s+[^\s,;"']+/gi, "[authorization redacted]")
    .replace(/\bsk-[A-Za-z0-9_-]+/g, "[key redacted]")
    .replace(
      /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,
      "[token redacted]",
    )
    .replace(/(https?:\/\/)[^\s/@]+:[^\s/@]+@/gi, "$1[credentials redacted]@")
    .replace(
      /\b((?:access|refresh|id)[_-]?token|api[_-]?key|client[_-]?secret|authorization|password)\s*[:=]\s*["']?[^\s,;&"']+/gi,
      "$1=[redacted]",
    )
    .replace(/\s+/g, " ")
    .trim();
  return text ? text.slice(0, 350) : null;
}
export async function readGenerationFailure(
  readFile: (path: string) => Promise<Buffer | null>,
): Promise<string | null> {
  try {
    const file = await readFile("/vercel/sandbox/failure.json");
    if (!file || file.byteLength > 4096) return null;
    const value = JSON.parse(file.toString("utf8")) as { message?: unknown };
    return sanitizeGenerationFailure(value.message);
  } catch {
    return null;
  }
}
