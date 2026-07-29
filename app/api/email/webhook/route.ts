/**
 * POST /api/email/webhook — delivery events (bounces, complaints).
 *
 * Point each provider's webhook here with the shared secret in the URL:
 *   https://<app>/api/email/webhook?token=<EMAIL_WEBHOOK_SECRET>
 * The middleware lets this path through the access gate (a provider can't
 * hold a login cookie); the token check below authenticates it instead — and
 * the route refuses everything when the env var is unset.
 *
 * A SHARED ACCOUNT. The SendGrid account serves the whole Travelgenix
 * estate, so this endpoint receives events for every tool that sends, not
 * just the CRM. Most of what arrives is not ours, and that is expected.
 *
 * So the shape is: normalise, ask ONCE which of these message ids we
 * recorded, then act only on those. A batch containing nothing of ours costs
 * a single indexed lookup and no writes — no per-event queries, and no log
 * line per foreign event, because at this volume that is just noise with a
 * bill attached.
 *
 * On an event that IS ours:
 *   1. the address goes on email_suppressions for THAT agency (the policy lib
 *      then refuses future sends to it, with the reason shown),
 *   2. the email_sends row flips to bounced/complained,
 *   3. email.bounced lands on the event spine.
 *
 * Soft bounces, deferrals, opens and deliveries are acknowledged and ignored.
 */

import { NextResponse } from "next/server";
import { createSystemClient } from "@/lib/supabase/server";
import { emitEvent } from "@/lib/events/emit";
import {
  normaliseEvents,
  messageIdsToCheck,
  ourEvents,
  type OwnedSend,
} from "@/lib/email/webhook-events";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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

  const events = normaliseEvents(payload);
  if (events.length === 0) {
    // Deliveries, opens, deferrals — or another tool's non-bounce traffic.
    return NextResponse.json({ ok: true, handled: 0 });
  }

  const ids = messageIdsToCheck(events);
  if (ids.length === 0) {
    return NextResponse.json({ ok: true, handled: 0 });
  }

  // System client: a provider has no session, and this endpoint legitimately
  // looks across agencies to find which of OUR sends an event refers to.
  const supabase = createSystemClient();

  // The one lookup. Everything not returned here belongs to another tool.
  const { data: sendRows, error } = await supabase
    .from("email_sends")
    .select("id, agency_id, household_id, provider_message_id")
    .in("provider_message_id", ids);

  if (error) {
    // Answer 200 anyway: a retry storm from the provider helps nobody, and
    // the next bounce for a dead address will suppress it just as well.
    console.error("[email/webhook] lookup failed:", error.message);
    return NextResponse.json({ ok: true, handled: 0 });
  }

  const mine = ourEvents(events, (sendRows ?? []) as OwnedSend[]);
  if (mine.length === 0) {
    return NextResponse.json({ ok: true, handled: 0 });
  }

  for (const { event, send } of mine) {
    // Suppress for the agency that actually sent it. Upsert on
    // (agency, email) — a second bounce is not news.
    await supabase.from("email_suppressions").upsert(
      {
        agency_id: send.agency_id,
        email: event.email,
        reason: event.reason,
        detail: event.detail,
      },
      { onConflict: "agency_id,email", ignoreDuplicates: true }
    );

    await supabase
      .from("email_sends")
      .update({ status: event.reason === "complaint" ? "complained" : "bounced" })
      .eq("id", send.id);

    await emitEvent(supabase, send.agency_id, {
      type: "email.bounced",
      subjectType: "email",
      subjectId: send.id,
      householdId: send.household_id,
      payload: {
        email: event.email,
        event: event.event,
        reason: event.reason,
        detail: event.detail,
      },
    });
  }

  // One line, not one per event — this endpoint sees the whole estate.
  console.log(
    `[email/webhook] ${mine.length} of ${events.length} suppressible events were ours`
  );

  return NextResponse.json({ ok: true, handled: mine.length });
}
