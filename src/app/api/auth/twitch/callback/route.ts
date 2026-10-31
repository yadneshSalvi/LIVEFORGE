import { session } from "@/server/security";
import { assert, HttpError } from "@/server/errors";
import { twitchCallback } from "@/server/twitch";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function GET(request: Request) {
  try {
    const host = session(request);
    const url = new URL(request.url);
    assert(
      !url.searchParams.get("error"),
      401,
      "twitch_declined",
      "Twitch authorization was declined. You can return to the studio and try again.",
    );
    await twitchCallback(
      host.showId,
      host.hostId,
      url.searchParams.get("state") || "",
      url.searchParams.get("code") || "",
    );
    return Response.redirect(
      new URL(
        "/studio?twitch=authorized",
        process.env.APP_BASE_URL || request.url,
      ),
      302,
    );
  } catch (error) {
    const reason =
      error instanceof HttpError ? error.code : "twitch_unavailable";
    const target = new URL(
      "/studio",
      process.env.APP_BASE_URL || new URL(request.url).origin,
    );
    target.searchParams.set("authError", reason);
    return Response.redirect(target, 302);
  }
}
