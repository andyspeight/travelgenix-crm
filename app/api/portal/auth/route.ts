/**
 * GET /api/portal/auth?token=… — the magic-link landing.
 *
 * Consumes the single-use token, and on success mints the signed portal
 * session cookie and sends the traveller where the link was aimed — the
 * portal home, or the quote or trip an emailed link named. A bad, used or
 * expired link lands on the login page with a gentle message — never an error
 * that reveals anything.
 *
 * Public (allow-listed in middleware): the session is being created here.
 */

import { NextResponse } from "next/server";
import { portalEnabled, signPortalSession, PORTAL_COOKIE, PORTAL_TTL_MS } from "@/lib/portal/session";
import { createPortalClient } from "@/lib/portal/client";
import { consumeLoginToken } from "@/lib/portal/token";
import { AGENCY_SLUG_RE } from "@/lib/portal/lookup";
import { safeNextPath } from "@/lib/portal/invite";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const base = (process.env.PORTAL_BASE_URL || new URL(request.url).origin).replace(/\/$/, "");
  if (!portalEnabled()) return NextResponse.redirect(`${base}/portal/login`);

  const url = new URL(request.url);
  const token = url.searchParams.get("token") ?? "";
  // A link minted from a branded screen sends a failed attempt back there.
  const slug = (url.searchParams.get("a") ?? "").toLowerCase();
  const loginPath = AGENCY_SLUG_RE.test(slug) ? `/portal/${slug}` : "/portal/login";

  const grant = await consumeLoginToken(createPortalClient(), token);
  if (!grant) {
    return NextResponse.redirect(`${base}${loginPath}?expired=1`);
  }

  // An emailed deep link says where it was meant to land (a quote, a trip).
  // Only a portal path is honoured, so a link can never redirect off-site.
  const next = safeNextPath(url.searchParams.get("next")) ?? "/portal";

  const value = await signPortalSession({
    agencyId: grant.agencyId,
    householdId: grant.householdId,
    contactId: grant.contactId,
  });
  const res = NextResponse.redirect(`${base}${next}`);
  res.cookies.set(PORTAL_COOKIE, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(PORTAL_TTL_MS / 1000),
  });
  return res;
}
