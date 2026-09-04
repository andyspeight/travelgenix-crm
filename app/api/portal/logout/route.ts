/**
 * POST /api/portal/logout — clear the traveller's portal session.
 */

import { NextResponse } from "next/server";
import { PORTAL_COOKIE } from "@/lib/portal/session";
import { portalBaseUrl } from "@/lib/portal/invite";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const base = portalBaseUrl(request.url);
  const res = NextResponse.redirect(`${base}/portal/login`, { status: 303 });
  res.cookies.set(PORTAL_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return res;
}
