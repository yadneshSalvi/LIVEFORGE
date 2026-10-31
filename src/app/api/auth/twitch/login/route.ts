import { session, jsonError } from "@/server/security";
import { assert } from "@/server/errors";
import { twitchLogin } from "@/server/twitch";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    const host = session(request);
    const showId = new URL(request.url).searchParams.get("showId");
    assert(
      showId === host.showId,
      404,
      "show_not_found",
      "Open the Twitch studio you want to authorize.",
    );
    return Response.redirect(await twitchLogin(showId, host.hostId), 302);
  } catch (error) {
    return jsonError(error);
  }
}
