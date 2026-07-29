/**
 * POST /api/email/webhook — Brevo delivery events (bounces, complaints).
 *
 * Point a Brevo transactional webhook here with the shared secret in the
 * URL: https://<app>/api/email/webhook?token=<EMAIL_WEBHOOK_SECRET>
 * The middleware lets this path through the access gate (Brevo can't log
 * in); the token check below is what authenticates it instead — required
 * whenever the env var is set, and the route refuses everything when it
 * isn't (no secret, no webhook).
 *
 * On a hard bounce / blocked / invalid address / spam complaint:
 *   1. the address goes on email_suppressions (future sends refuse with the
 *      reason — the policy lib enforces it),
 *   2. the original email_sends row flips to bounced/complained,
 *   3. email.bounced lands on the event spine.
 * Soft bounces and delivery confirmations are acknowledged and ignored —
 * suppressing on a full mailbox would be trigger-happy.
 */

import { NextResponse } from "next/server";
import { createClient, AGENCY_ID } from "@/lib/supabase/server";
import { emitEvent } from "@/lib/events/emit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Brevo event names → our suppression reason. Anything not here is ignored.
const SUPPRESS: Record<string, "bounce" | "complaint"> = {
  hard_bounce: "bounce",
  blocked: "bounce",
  invalid_email: "bounce",
  spam: "complaint",
  complaint: "complaint",
};

export async function POST(request: Request) {
  const secret = process.env.EMAIL_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ ok: false, error: "Webhook not enabled" }, { status: 404 });
  }
  const token = new URL(request.url).searchParams.get("token");
  if (token !== secret) {
    return NextResponse.json({ ok: false, error: "Bad token" }, { status: 401 });
  }

  let payload: { event?: unknown; email?: unknown; ["message-id"]?: unknown; reason?: unknown };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const event = typeof payload.event === "string" ? payload.event : "";
  const email =
    typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
  const messageId =
    typeof payload["message-id"] === "string" ? payload["message-id"] : null;
  const detail = typeof payload.reason === "string" ? payload.reason.slice(0, 300) : null;

  const reason = SUPPRESS[event];
  if (!reason || !email) {
    // Not an event we act on — acknowledge so Brevo doesn't retry.
    return NextResponse.json({ ok: true, ignored: true });
  }

  const supabase = createClient();

  // 1. Suppress. Upsert on (agency, email) — a second bounce is not news.
  await supabase
    .from("email_suppressions")
    .upsert(
      { agency_id: AGENCY_ID, email, reason, detail },
      { onConflict: "agency_id,email", ignoreDuplicates: true }
    );

  // 2. Flip the audit row so /reports-style views and the record tell the truth.
  let sendId: string | null = null;
  let householdId: string | null = null;
  if (messageId) {
    const { data: send } = await supabase
      .from("email_sends")
      .update({ status: reason === "complaint" ? "complained" : "bounced" })
      .eq("agency_id", AGENCY_ID)
      .eq("provider_message_id", messageId)
      .select("id, household_id")
      .maybeSingle();
    sendId = (send?.id as string | undefined) ?? null;
    householdId = (send?.household_id as string | undefined) ?? null;
  }

  // 3. Spine.
  await emitEvent(supabase, AGENCY_ID, {
    type: "email.bounced",
    subjectType: "email",
    subjectId: sendId ?? email,
    householdId,
    payload: { email, event, reason, detail },
  });

  return NextResponse.json({ ok: true });
}
