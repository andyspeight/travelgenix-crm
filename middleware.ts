/**
 * The front door (edge middleware).
 *
 * When LUNA_ACCESS_CODE is set, every page and API route requires the signed
 * access cookie; without it, pages redirect to /login and API calls get a
 * 401. When the env var is NOT set the gate is open — so a fresh deploy or
 * local dev never locks anyone out, and enabling protection is exactly one
 * environment variable.
 *
 * /login and /api/auth/access stay reachable (you must be able to knock).
 */

import { NextResponse, type NextRequest } from "next/server";
import { ACCESS_COOKIE, verifyAccessToken } from "@/lib/auth/gate";

export const config = {
  // Everything except Next's static assets and the favicon.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

export async function middleware(request: NextRequest) {
  const code = process.env.LUNA_ACCESS_CODE;
  if (!code) return NextResponse.next(); // gate not enabled

  const { pathname } = request.nextUrl;
  // /api/email/webhook authenticates itself with a shared secret instead —
  // the email provider can't hold a login cookie.
  if (
    pathname === "/login" ||
    pathname === "/api/auth/access" ||
    pathname === "/api/email/webhook"
  ) {
    return NextResponse.next();
  }

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
