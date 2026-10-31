import { readLibraryEntry } from "@/server/library";
import { jsonError, session } from "@/server/security";
export const runtime = "nodejs";
export async function GET(
  request: Request,
  context: { params: Promise<{ entryId: string }> },
) {
  try {
    const host = session(request);
    const { entryId } = await context.params;
    return Response.json(
      { entry: await readLibraryEntry(host.hostId, entryId) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return jsonError(error);
  }
}
