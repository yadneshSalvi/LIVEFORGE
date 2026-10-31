import { chatRepliesAuthorized } from "@/server/twitch-replies";
import { generationAccess } from "@/server/twitch";
import { cookieValue, unsign, type HostSession } from "@/server/security";
import { generationConfigured } from "@/server/generation";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function GET(request: Request) {
  const host = unsign<HostSession>(cookieValue(request));
  const access = await generationAccess(
    host && host.expiresAt > Date.now() ? host.hostId : undefined,
  );
  return Response.json(
    {
      service: "LIVEFORGE",
      storage: process.env.DATABASE_URL ? "postgres" : "development-file",
      generation: {
        configured: await generationConfigured(),
        allowed: access.allowed,
        authorization: access.authorization,
        quota: access.quota,
        provider: "official-codex-sdk-in-vercel-sandbox",
        model: process.env.CODEX_MODEL || "gpt-6.1-sol",
      },
      twitch: {
        configured: Boolean(
          process.env.TWITCH_CLIENT_ID && process.env.TWITCH_CLIENT_SECRET,
        ),
        transport: "host-browser-eventsub-websocket",
        chatRepliesAuthorized: await chatRepliesAuthorized(
          host && host.expiresAt > Date.now() ? host.hostId : undefined,
        ),
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
