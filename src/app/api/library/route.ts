import { listLibrary } from "@/server/library";
import { jsonError, session } from "@/server/security";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    const host = session(request);
    return Response.json(
      { entries: await listLibrary(host.hostId) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return jsonError(error);
  }
}
