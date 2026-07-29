/**
 * POST /api/email/webhook — delivery events (bounces, complaints) from BOTH
 * providers, one endpoint.
 *
 * Point each provider's webhook here with the shared secret in the URL:
 *   https://<app>/api/email/webhook?token=<EMAIL_WEBHOOK_SECRET>
 * The middleware lets this path through the access gate (a provider can't
 * hold a login cookie); the token check below authenticates it instead —
 * and the route refuses everything when the env var is unset (no secret,
 * no webhook).
 *
 * Shapes: Brevo posts ONE event object ({event: "hard_bounce", email,
 * "message-id"}). SendGrid posts an ARRAY of event objects ({event:
 * "bounce"|"dropped"|"spamreport", email, sg_message_id}). Both are
 * normalised below; suppress-worthy events do three things:
 *   1. the address goes on email_suppressions (future sends refuse with the
 *      reason — the policy lib enforces it),
 *   2. the original email_sends row flips to bounced/complained,
 *   3. email.bounced lands on the event spine.
 * Soft bounces, opens and deliveries are acknowledged and ignored —
 * suppressing on a full mailbox would be trigger-happy.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { emitEvent } from "@/lib/events/emit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Provider event names → our suppression reason. Anything not here is ignored.
// Brevo: hard_bounce / blocked / invalid_email / spam.
// SendGrid: bounce / dropped / spamreport.
const SUPPRESS: Record<string, "bounce" | "complaint"> = {
  hard_bounce: "bounce",
  blocked: "bounce",
  invalid_email: "bounce",
  bounce: "bounce",
  dropped: "bounce",
  spam: "complaint",
  complaint: "complaint",
  spamreport: "complaint",
};

type RawEvent = {
  event?: unknown;
  email?: unknown;
  reason?: unknown;
  ["message-id"]?: unknown; // Brevo
  sg_message_id?: unknown; // SendGrid (id + routing suffix after a dot)
};

function normalise(raw: RawEvent): {
  event: string;
  email: string;
  messageId: string | null;
  detail: string | null;
} {
  const sgId = typeof raw.sg_message_id === "string" ? raw.sg_message_id : null;
  const brevoId = typeof raw["message-id"] === "string" ? raw["message-id"] : null;
  return {
    event: typeof raw.event === "string" ? raw.event : "",
    email: typeof raw.email === "string" ? raw.email.trim().toLowerCase() : "",
    // SendGrid appends a routing suffix after the first dot; we stored the
    // bare X-Message-Id header at send time, so strip back to it.
    messageId: sgId ? sgId.split(".")[0] : brevoId,
    detail: typeof raw.reason === "string" ? raw.reason.slice(0, 300) : null,
  };
}

export async function POST(request: Request) {
  const secret = process.env.EMAIL_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ ok: false, error: "Webhook not enabled" }, { status: 404 });
  }
  const token = new URL(request.url).searchParams.get("token");
  if (token !== secret) {
    return NextResponse.json({ ok: false, error: "Bad token" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  // One endpoint, two shapes: SendGrid batches events in an array.
  const events = (Array.isArray(payload) ? payload : [payload])
    .slice(0, 100)
    .map((e) => normalise((e ?? {}) as RawEvent))
    .filter((e) => SUPPRESS[e.event] && e.email);

  if (events.length === 0) {
    // Nothing we act on — acknowledge so the provider doesn't retry.
    return NextResponse.json({ ok: true, ignored: true });
  }

  const supabase = createClient();
  let handled = 0;

  for (const ev of events) {
    const reason = SUPPRESS[ev.event];

    // WHICH AGENCY? A provider has no session, so unlike every other route
    // the tenant can't come from the caller. It comes from the send this
    // event is about: we look the message id up in the audit table and take
    // the agency that sent it. An event we can't tie to a real send of ours
    // is skipped rather than guessed — suppressing an address for the wrong
    // agency would silently stop THEIR mail on someone else's bounce.
    let sendId: string | null = null;
    let householdId: string | null = null;
    let agencyId: string | null = null;

    if (ev.messageId) {
      const { data: send } = await supabase
        .from("email_sends")
        .update({ status: reason === "complaint" ? "complained" : "bounced" })
        .eq("provider_message_id", ev.messageId)
        .select("id, household_id, agency_id")
        .maybeSingle();
      sendId = (send?.id as string | undefined) ?? null;
      householdId = (send?.household_id as string | undefined) ?? null;
      agencyId = (send?.agency_id as string | undefined) ?? null;
    }

    if (!agencyId) {
      console.warn(
        `[email/webhook] ${ev.event} for ${ev.email} matched no send — skipped`
      );
      continue;
    }

    // Suppress. Upsert on (agency, email) — a second bounce is not news.
    await supabase
      .from("email_suppressions")
      .upsert(
        { agency_id: agencyId, email: ev.email, reason, detail: ev.detail },
        { onConflict: "agency_id,email", ignoreDuplicates: true }
      );

    // Spine.
    await emitEvent(supabase, agencyId, {
      type: "email.bounced",
      subjectType: "email",
      subjectId: sendId ?? ev.email,
      householdId,
      payload: { email: ev.email, event: ev.event, reason, detail: ev.detail },
    });
    handled++;
  }

  return NextResponse.json({ ok: true, handled });
}
