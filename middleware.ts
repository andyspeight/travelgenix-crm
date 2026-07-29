/**
 * The front door (edge middleware).
 *
 * Two gates, in priority order:
 *
 *   CONTROL (CONTROL_BASE_URL set) — Luna Work is a Luna suite product, so
 *   sign-in is Control's `tg_session` cookie, shared across .travelify.io.
 *   Middleware only checks the cookie is PRESENT and sends people without one
 *   to Control's sign-in. It deliberately does not verify the token here:
 *   verification means a network call to Control, which belongs in the
 *   request path (lib/auth/session), not on every static asset fetch. So this
 *   is a UX gate; the real authorisation happens server-side per request,
 *   where an invalid cookie or a missing product grant resolves to no session
 *   and no data.
 *
 *   ACCESS CODE (LUNA_ACCESS_CODE set, no Control) — the interim shared-code
 *   lock: an HMAC-signed, expiring cookie checked at the edge.
 *
 * Neither set = open, so a fresh deploy or local dev never locks anyone out.
 *
 * /api/email/webhook is always let through: email providers authenticate with
 * a shared secret in the URL, not a login cookie.
 */

import { NextResponse, type NextRequest } from "next/server";
import { ACCESS_COOKIE, verifyAccessToken } from "@/lib/auth/gate";

export const config = {
  // Everything except Next's static assets and the favicon.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

const CONTROL_COOKIE = "tg_session";

function isAlwaysOpen(pathname: string): boolean {
  return (
    pathname === "/login" ||
    pathname === "/api/auth/access" ||
    pathname === "/api/email/webhook"
  );
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (isAlwaysOpen(pathname)) return NextResponse.next();

  const controlBase = process.env.CONTROL_BASE_URL;
  if (controlBase) {
    if (request.cookies.get(CONTROL_COOKIE)) return NextResponse.next();

    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { ok: false, error: "Sign in required" },
        { status: 401 }
      );
    }
    // Send them to Control's sign-in, and back here afterwards.
    const signin = new URL("/signin.html", controlBase);
    signin.searchParams.set("next", request.nextUrl.toString());
    return NextResponse.redirect(signin);
  }

  const code = process.env.LUNA_ACCESS_CODE;
  if (!code) return NextResponse.next(); // no gate enabled

  const token = request.cookies.get(ACCESS_COOKIE)?.value;
  if (await verifyAccessToken(code, token)) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      { ok: false, error: "Access required" },
      { status: 401 }
    );
  }

  const login = request.nextUrl.clone();
  login.pathname = "/login";
  login.search = pathname !== "/" ? `?from=${encodeURIComponent(pathname)}` : "";
  return NextResponse.redirect(login);
}
