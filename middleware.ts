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
 * CANONICAL HOST (Control mode only) — Control's `tg_session` cookie is scoped
 * to .travelify.io, so it is only sent to the app's travelify.io host
 * (crm.travelify.io by default, overridable with CANONICAL_HOST). A launchpad
 * link or stale bookmark that opens the raw *.vercel.app deployment carries no
 * cookie, so the gate below would bounce it to Control's sign-in and back in an
 * endless loop. We therefore redirect any non-canonical host to the canonical
 * one BEFORE the cookie check, so the cookie is actually present when we look.
 * Local dev and the always-open webhook/cron/widget routes are left untouched.
 *
 * /api/email/webhook, /api/email/inbound and /api/cron/* are always let
 * through: an email provider, a mail server delivering a reply, and a
 * scheduler cannot hold a login cookie. They authenticate with a shared
 * secret inside the route instead, and refuse everything when that secret is
 * unset.
 */

import { NextResponse, type NextRequest } from "next/server";
import { ACCESS_COOKIE, verifyAccessToken } from "@/lib/auth/gate";

export const config = {
  // Everything except Next's static assets and the favicon.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

const CONTROL_COOKIE = "tg_session";

// The host the .travelify.io sign-in cookie is actually sent to. Default to
// crm.travelify.io; CANONICAL_HOST lets a white-label / renamed deployment
// override it without a code change.
const CANONICAL_HOST = process.env.CANONICAL_HOST || "crm.travelify.io";

/**
 * In Control mode, force any non-canonical host onto the canonical one so the
 * sign-in cookie is present when the gate runs. Returns a redirect, or null
 * when the request is already fine (canonical host, or local dev).
 */
function canonicalHostRedirect(request: NextRequest): NextResponse | null {
  const hostname = (request.headers.get("host") ?? "").split(":")[0].toLowerCase();
  // Hostless, localhost, or a bare machine name (dev): never redirect.
  if (!hostname || hostname === "localhost" || !hostname.includes(".")) return null;
  if (hostname === "127.0.0.1") return null;
  if (hostname === CANONICAL_HOST.toLowerCase()) return null;

  const target = new URL(
    request.nextUrl.pathname + request.nextUrl.search,
    `https://${CANONICAL_HOST}`
  );
  // 307, not 308: a temporary redirect keeps browsers/edges from permanently
  // caching the mapping, so changing CANONICAL_HOST later takes effect at once.
  return NextResponse.redirect(target, 307);
}

function isAlwaysOpen(pathname: string): boolean {
  return (
    pathname === "/login" ||
    pathname === "/api/auth/access" ||
    pathname === "/api/email/webhook" ||
    // Inbound Parse: a mail server delivering a customer's reply.
    pathname === "/api/email/inbound" ||
    // A website enquiry widget can't hold a login cookie; it authenticates
    // with a per-agency key + HMAC signature inside the route instead.
    pathname === "/api/widget/lead" ||
    // The customer portal is a separate surface for the agency's OWN customers
    // (travellers). It authenticates them with its own magic-link session
    // (lib/portal/session), never the Control/agency sign-in, so it is let
    // through this gate exactly like the widget and webhook routes.
    pathname === "/portal" ||
    pathname.startsWith("/portal/") ||
    pathname.startsWith("/api/portal/") ||
    // The browser posts CSP violation reports here with no session (and often
    // no credentials). The route only logs a capped, rate-limited line.
    pathname === "/api/csp-report" ||
    // An uptime monitor cannot sign in. The route answers liveness only —
    // no counts, no config, nothing that maps the estate.
    pathname === "/api/health" ||
    // The scheduler cannot hold a sign-in cookie either; it authenticates
    // with CRON_SECRET inside the route.
    pathname.startsWith("/api/cron/")
  );
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (isAlwaysOpen(pathname)) return NextResponse.next();

  const controlBase = process.env.CONTROL_BASE_URL;
  if (controlBase) {
    // Get onto crm.travelify.io first, or the cookie below is never sent.
    const canonical = canonicalHostRedirect(request);
    if (canonical) return canonical;

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
