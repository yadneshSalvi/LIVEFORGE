import { randomUUID } from "node:crypto";
import { createShow, listHostShows } from "@/server/show";
import { assert } from "@/server/errors";
import {
  cookieValue,
  digest,
  jsonBody,
  jsonError,
  requireSameOrigin,
  sessionCookie,
  session,
  unsign,
  type HostSession,
} from "@/server/security";
import { getStore } from "@/server/store";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const body = await jsonBody(request);
    assert(
      body.mode === "practice" || body.mode === "twitch",
      400,
      "show_mode",
      "Choose practice or Twitch mode.",
    );
    const old = unsign<HostSession>(cookieValue(request));
    const ownerId =
      old && old.expiresAt > Date.now() ? old.hostId : randomUUID();
    const key =
      "creation-rate:" +
      digest(
        (request.headers.get("x-forwarded-for")?.split(",")[0] || "local") +
          ":" +
          new Date().toISOString().slice(0, 13),
      );
    const store = getStore();
    await store.create(key, { count: 0 });
    await store.update<{ count: number }, void>(key, (record) => {
      assert(
        record.count < 12,
        429,
        "studio_limit",
        "Too many studios were created from this connection. Resume an existing studio or wait.",
      );
      record.count++;
    });
    const show = await createShow(ownerId, body.mode);
    return Response.json(
      { show },
      {
        status: 201,
        headers: {
          "Set-Cookie": sessionCookie({
            hostId: ownerId,
            showId: show.id,
            expiresAt: Date.now() + 30 * 24 * 60 * 60_000,
          }),
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    return jsonError(error);
  }
}

export async function GET(request: Request) {
  try {
    const host = session(request);
    return Response.json(
      {
        shows: await listHostShows(host.hostId, host.showId),
        currentShowId: host.showId,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return jsonError(error);
  }
}
