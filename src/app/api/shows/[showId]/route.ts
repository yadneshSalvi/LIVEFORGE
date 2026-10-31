import { getStore } from "@/server/store";
import { assert } from "@/server/errors";
import { publicView, recoverAbandonedJobs } from "@/server/show";
import { jsonError } from "@/server/security";
export const runtime = "nodejs";
export async function GET(
  _request: Request,
  context: { params: Promise<{ showId: string }> },
) {
  try {
    const { showId } = await context.params;
    const show = await recoverAbandonedJobs(showId);
    assert(show, 404, "show_not_found", "Show not found.");
    return Response.json(
      { show: publicView(show) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return jsonError(error);
  }
}
