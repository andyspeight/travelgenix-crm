/**
 * GET /api/portal/auth?token=… — the magic-link landing.
 *
 * Consumes the single-use token, and on success mints the signed portal
 * session cookie and sends the traveller into the portal. A bad, used or
 * expired link lands on the login page with a gentle message — never an error
 * that reveals anything.
 *
 * Public (allow-listed in middleware): the session is being created here.
 */

import { NextResponse } from "next/server";
import { portalEnabled, signPortalSession, PORTAL_COOKIE, PORTAL_TTL_MS } from "@/lib/portal/session";
import { createPortalClient } from "@/lib/portal/client";
import { consumeLoginToken } from "@/lib/portal/token";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const base = (process.env.PORTAL_BASE_URL || new URL(request.url).origin).replace(/\/$/, "");
  if (!portalEnabled()) return NextResponse.redirect(`${base}/portal/login`);

  const token = new URL(request.url).searchParams.get("token") ?? "";
  const grant = await consumeLoginToken(createPortalClient(), token);
  if (!grant) {
    return NextResponse.redirect(`${base}/portal/login?expired=1`);
  }

  const value = await signPortalSession({
    agencyId: grant.agencyId,
    householdId: grant.householdId,
    contactId: grant.contactId,
  });
  const res = NextResponse.redirect(`${base}/portal`);
  res.cookies.set(PORTAL_COOKIE, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(PORTAL_TTL_MS / 1000),
  });
  return res;
}
