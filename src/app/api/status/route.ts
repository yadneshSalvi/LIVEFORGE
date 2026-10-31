import { generationHostAllowed } from "@/server/twitch";
import { cookieValue, unsign, type HostSession } from "@/server/security";
import { generationConfigured } from "@/server/generation";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function GET(request: Request) {
  const host = unsign<HostSession>(cookieValue(request));
  let allowed = false;
  try {
    allowed = await generationHostAllowed(
      host && host.expiresAt > Date.now() ? host.hostId : undefined,
    );
  } catch {}
  return Response.json(
    {
      service: "LIVEFORGE",
      storage: process.env.DATABASE_URL ? "postgres" : "development-file",
      generation: {
        configured: generationConfigured(),
        allowed,
        authorization: allowed
          ? "Authorized host"
          : "Connect an invited Twitch host for live generation. Public practice can reuse a previously generated sample.",
        provider: "official-codex-sdk-in-vercel-sandbox",
        model: process.env.CODEX_MODEL || "gpt-6.1-sol",
      },
      twitch: {
        configured: Boolean(
          process.env.TWITCH_CLIENT_ID && process.env.TWITCH_CLIENT_SECRET,
        ),
        transport: "host-browser-eventsub-websocket",
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
