import { maintainTwitchSession } from "@/server/twitch";
import { hostView, ownedShow } from "@/server/show";
import { jsonError, session } from "@/server/security";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function GET(request: Request) {
  try {
    const host = session(request);
    return Response.json(
      {
        show: hostView(
          await maintainTwitchSession(
            await ownedShow(host.showId, host.hostId),
          ),
        ),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return jsonError(error);
  }
}
