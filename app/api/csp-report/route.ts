/**
 * POST /api/csp-report — where the browser posts CSP violations.
 *
 * The Content-Security-Policy ships Report-Only first (next.config.mjs), so
 * before we flip it to enforcing we need to SEE what it would have blocked.
 * Browsers post violation reports here; we log a concise line to the security
 * channel and return 204. Public by necessity (a report carries no session and
 * may be sent with no credentials), so it is body-capped and rate-limited, and
 * it only ever logs — it never reads or writes application data.
 */

import { NextResponse } from "next/server";
import { enforceRateLimit, clientKey } from "@/lib/ai/rate-limit";
import { logSecurityEvent, clientIp } from "@/lib/security/log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** A CSP report is small; anything larger is noise or abuse. */
const MAX_BODY = 16_000;

export async function POST(request: Request) {
  // Reports can arrive in bursts; cap per IP so the endpoint can't be used to
  // spam the logs. Dropped reports are simply not recorded — 204 either way.
  const limit = await enforceRateLimit(clientKey(request, "csp-report"), 60, 60_000);
  if (!limit.ok) return new NextResponse(null, { status: 204 });

  let text = "";
  try {
    text = (await request.text()).slice(0, MAX_BODY);
  } catch {
    return new NextResponse(null, { status: 204 });
  }

  // Two shapes land here: the legacy application/csp-report ({"csp-report":{…}})
  // and the Reporting API array ([{ type, body }]). Pull out the few fields
  // worth logging without trusting the structure.
  let note = "unparsed report";
  try {
    const json = JSON.parse(text) as unknown;
    const r = (Array.isArray(json) ? (json[0] as Record<string, unknown>)?.body : json) as
      | Record<string, unknown>
      | undefined;
    const rep = (r?.["csp-report"] as Record<string, unknown>) ?? r ?? {};
    const directive = rep["effective-directive"] ?? rep["violated-directive"] ?? rep["effectiveDirective"];
    const blocked = rep["blocked-uri"] ?? rep["blockedURL"];
    const doc = rep["document-uri"] ?? rep["documentURL"];
    const parts = [directive, blocked, doc].filter((v) => typeof v === "string") as string[];
    if (parts.length) note = parts.join(" | ").slice(0, 300);
  } catch {
    // Non-JSON or unexpected shape — still record that a report arrived.
  }

  logSecurityEvent("csp.violation", {
    route: "/api/csp-report",
    ip: clientIp(request),
    note,
  });
  return new NextResponse(null, { status: 204 });
}
