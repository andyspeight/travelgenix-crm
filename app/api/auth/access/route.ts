/**
 * POST /api/auth/access — the knock on the front door.
 *
 * Body: { code }. On a match with LUNA_ACCESS_CODE it sets the signed,
 * httpOnly access cookie (30 days). Comparison is constant-time with no length
 * leak (SHA-256 then timingSafeEqual) and the endpoint is rate-limited hard
 * (5/min per IP) to make brute force boring. Returns identical errors for wrong
 * code and disabled gate — no oracle. Rejections are logged to the security
 * channel so a brute-force attempt is visible.
 */

import { NextResponse } from "next/server";
import { enforceRateLimit, clientKey } from "@/lib/ai/rate-limit";
import { ACCESS_COOKIE, ACCESS_TTL_MS, signAccessToken } from "@/lib/auth/gate";
import { safeSecretEqual } from "@/lib/security/secret";
import { logSecurityEvent, clientIp } from "@/lib/security/log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const limit = await enforceRateLimit(clientKey(request, "access"), 5, 60_000);
  if (!limit.ok) {
    return NextResponse.json(
      { ok: false, error: "Too many attempts. Wait a moment." },
      { status: 429, headers: { "retry-after": String(limit.retryAfter) } }
    );
  }

  let body: { code?: unknown };
  try {
    body = (await request.json()) as { code?: unknown };
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });
  }

  const secret = process.env.LUNA_ACCESS_CODE;
  const supplied = typeof body.code === "string" ? body.code : "";

  if (!secret || !supplied || !safeSecretEqual(supplied, secret)) {
    logSecurityEvent("auth.access.rejected", {
      route: "/api/auth/access",
      ip: clientIp(request),
    });
    return NextResponse.json({ ok: false, error: "That code isn't right" }, { status: 401 });
  }

  const token = await signAccessToken(secret);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ACCESS_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(ACCESS_TTL_MS / 1000),
  });
  return res;
}
