/**
 * POST /api/email/send — a person pressing Send.
 *
 * Body: {
 *   to_email?, contact_id?, household_id?, enquiry_id?,
 *   subject, body,
 *   purpose: "operational" | "marketing",
 *   context?          // "inbox_reply", "enquiry_response", "journey", ...
 * }
 *
 * The pipeline itself lives in lib/email/send, shared with the sequence
 * runner, so an unattended send passes exactly the same consent check,
 * suppression check and per-agency identity as this one. This route only
 * validates input, establishes who is asking, and translates the outcome
 * into an HTTP answer.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { apiAgencyId } from "@/lib/auth/session";
import { sendCrmEmail } from "@/lib/email/send";
import { enforceRateLimit, clientKey } from "@/lib/ai/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MAX_SUBJECT = 200;
const MAX_BODY = 10_000;

const uuidOrNull = (v: unknown): string | null =>
  typeof v === "string" && UUID_RE.test(v) ? v : null;

export async function POST(request: Request) {
  // Not an AI surface, but it IS spend + reputation — meter it the same way.
  const limit = await enforceRateLimit(clientKey(request, "email-send"), 30, 60_000);
  if (!limit.ok) {
    return NextResponse.json(
      { ok: false, error: "Too many sends in a minute. Pause briefly and try again." },
      { status: 429 }
    );
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const subject = typeof parsed.subject === "string" ? parsed.subject.trim() : "";
  const body = typeof parsed.body === "string" ? parsed.body.trim() : "";
  if (!subject || subject.length > MAX_SUBJECT) {
    return NextResponse.json({ ok: false, error: "Subject is required (max 200 chars)." }, { status: 400 });
  }
  if (!body || body.length > MAX_BODY) {
    return NextResponse.json({ ok: false, error: "Body is required (max 10,000 chars)." }, { status: 400 });
  }

  const supabase = createClient();
  const agencyId = await apiAgencyId();
  if (!agencyId) {
    return NextResponse.json(
      { ok: false, error: "No access to this workspace." },
      { status: 403 }
    );
  }

  const outcome = await sendCrmEmail({
    supabase,
    agencyId,
    toEmail: typeof parsed.to_email === "string" ? parsed.to_email : null,
    contactId: uuidOrNull(parsed.contact_id),
    householdId: uuidOrNull(parsed.household_id),
    enquiryId: uuidOrNull(parsed.enquiry_id),
    subject,
    body,
    purpose: parsed.purpose === "marketing" ? "marketing" : "operational",
    context: typeof parsed.context === "string" ? parsed.context.slice(0, 80) : null,
  });

  if (outcome.ok) {
    return NextResponse.json({ ok: true, to: outcome.to, id: outcome.sendId });
  }

  const status =
    outcome.reason === "not_configured"
      ? 503
      : outcome.reason === "refused"
        ? 403
        : outcome.reason === "not_found"
          ? 404
          : 502;

  return NextResponse.json(
    {
      ok: false,
      error: outcome.error,
      ...(outcome.reason === "not_configured" ? { not_configured: true } : {}),
    },
    { status }
  );
}
