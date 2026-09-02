/**
 * POST /api/portal/request-link — "email me a link to see my trips".
 *
 * Body: { email }. For every contact whose email matches, we mint a single-use
 * token and email a login link from that agency. The response is ALWAYS the
 * same generic success — we never reveal whether an email is on file, so the
 * endpoint can't be used to enumerate customers. Rate-limited per IP.
 *
 * Public (allow-listed in middleware): a traveller has no session yet.
 */

import { NextResponse } from "next/server";
import { enforceRateLimit, clientKey } from "@/lib/ai/rate-limit";
import { portalEnabled } from "@/lib/portal/session";
import { createPortalClient } from "@/lib/portal/client";
import { findContactsByEmail } from "@/lib/portal/lookup";
import { createLoginToken } from "@/lib/portal/token";
import { sendLoginLink } from "@/lib/portal/mailer";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Always the same answer, so the endpoint never reveals whether an email exists. */
function generic() {
  return NextResponse.json({
    ok: true,
    message: "If that email is on file, we've sent a link to view your trips.",
  });
}

export async function POST(request: Request) {
  if (!portalEnabled()) {
    return NextResponse.json({ ok: false, error: "Not available" }, { status: 404 });
  }

  const limit = await enforceRateLimit(clientKey(request, "portal-link"), 5, 60_000);
  if (!limit.ok) {
    return NextResponse.json(
      { ok: false, error: "Too many requests. Please wait a moment." },
      { status: 429, headers: { "retry-after": String(limit.retryAfter) } }
    );
  }

  let email = "";
  try {
    const body = (await request.json()) as { email?: unknown };
    email = typeof body.email === "string" ? body.email.trim() : "";
  } catch {
    return generic(); // don't leak parse errors either
  }
  if (!email || !email.includes("@")) return generic();

  // Everything below is best-effort behind the generic response, so a slow or
  // failed provider never tells the caller whether the email exists.
  try {
    const supabase = createPortalClient();
    const matches = await findContactsByEmail(supabase, email);
    const base = (process.env.PORTAL_BASE_URL || new URL(request.url).origin).replace(/\/$/, "");

    for (const m of matches) {
      const token = await createLoginToken(supabase, {
        agencyId: m.agencyId,
        householdId: m.householdId,
        contactId: m.contactId,
        email: m.email,
      });
      const link = `${base}/api/portal/auth?token=${token}`;
      const name = [m.firstName, m.lastName].filter(Boolean).join(" ") || null;
      await sendLoginLink(supabase, { agencyId: m.agencyId, toEmail: m.email, toName: name, link });
    }
  } catch {
    // Swallow: the caller always gets the same answer.
  }

  return generic();
}
