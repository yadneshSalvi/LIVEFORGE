import { NextResponse, type NextRequest } from "next/server";

/** Production aliases enter through one origin so host cookies and OAuth agree. */
export function proxy(request: NextRequest) {
  const configured = process.env.APP_BASE_URL;
  if (process.env.VERCEL_ENV !== "production" || !configured)
    return NextResponse.next();

  let canonical: URL;
  try {
    canonical = new URL(configured);
  } catch {
    return NextResponse.next();
  }
  if (
    canonical.protocol !== "https:" ||
    canonical.username ||
    canonical.password ||
    ["localhost", "127.0.0.1", "[::1]"].includes(canonical.hostname) ||
    request.nextUrl.origin === canonical.origin
  )
    return NextResponse.next();

  canonical.pathname = request.nextUrl.pathname;
  canonical.search = request.nextUrl.search;
  canonical.hash = "";
  if (!["GET", "HEAD"].includes(request.method))
    return NextResponse.json(
      {
        error: "canonical_origin",
        message:
          "Open the canonical LIVEFORGE studio before changing this show.",
        studioUrl: new URL("/studio", canonical.origin).toString(),
      },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  return NextResponse.redirect(canonical, 308);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg).*)"],
};
