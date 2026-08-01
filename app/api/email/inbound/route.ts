/**
 * POST /api/email/inbound — a customer's reply, arriving.
 *
 * SendGrid Inbound Parse posts the whole message here as multipart form data
 * when mail arrives at the configured domain:
 *   https://<app>/api/email/inbound?token=<EMAIL_WEBHOOK_SECRET>
 * The middleware lets this path through the access gate (a mail server holds
 * no login cookie); the token authenticates it instead, and the route refuses
 * everything when the env var is unset.
 *
 * WHAT IT DOES, in order:
 *   1. parse the message and work out who it is from (lib/email/inbound.ts),
 *   2. one batched lookup for the send it answers and the contact it is from,
 *   3. record it on email_inbound — ALWAYS, matched or not,
 *   4. when matched: put it on the timeline as an unread inbound email, so it
 *      lands in the Inbox the agent already works,
 *   5. mark the send it answers as replied to,
 *   6. emit email.replied.
 *
 * The chase stops by itself. The sequence runner treats an inbound
 * interaction as "they replied", so writing step 4 is what ends the chase —
 * no second mechanism, no chance of the two disagreeing.
 *
 * AN AUTO-REPLY IS RECORDED BUT DOES NOT COUNT. It goes on the timeline
 * flagged as automatic and is excluded from the reply signal, because a
 * machine saying "I am away" is the opposite of an answer.
 *
 * ALWAYS ANSWER 200. A mail server that gets a 500 retries, then bounces the
 * customer's reply back at them. Failures are logged here, not pushed back
 * onto the person who wrote in.
 */

import { NextResponse } from "next/server";
import { createSystemClient } from "@/lib/supabase/server";
import { emitEvent } from "@/lib/events/emit";
import {
  parseInbound,
  threadKeys,
  matchInbound,
  countsAsReply,
  type InboundFields,
  type MatchableContact,
  type MatchableSend,
} from "@/lib/email/inbound";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Enough for a long reply with a quoted thread; not enough to be a weapon. */
const MAX_BODY = 100_000;

export async function POST(request: Request) {
  const secret = process.env.EMAIL_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ ok: false, error: "Inbound not enabled" }, { status: 404 });
  }
  if (new URL(request.url).searchParams.get("token") !== secret) {
    return NextResponse.json({ ok: false, error: "Bad token" }, { status: 401 });
  }

  // Inbound Parse posts multipart form data; nothing else is expected.
  let fields: InboundFields;
  try {
    const form = await request.formData();
    const read = (k: string) => {
      const v = form.get(k);
      return typeof v === "string" ? v.slice(0, MAX_BODY) : undefined;
    };
    fields = {
      from: read("from"),
      to: read("to"),
      subject: read("subject"),
      text: read("text"),
      headers: read("headers"),
      envelope: read("envelope"),
    };
  } catch {
    return NextResponse.json({ ok: true, handled: 0, note: "Unreadable payload" });
  }

  const msg = parseInbound(fields);
  if (!msg.fromEmail) {
    return NextResponse.json({ ok: true, handled: 0, note: "No sender" });
  }

  const keys = threadKeys(msg);
  const supabase = createSystemClient();

  // ─── The lookups: at most two, both indexed ─────────────────────────────
  // Cross-agency by necessity — working out WHICH agency this belongs to is
  // the entire job. See lib/supabase/tenant-filters.test.ts for the record.
  const sendFilters: string[] = [];
  if (keys.sendId) sendFilters.push(`id.eq.${keys.sendId}`);
  if (keys.tokens.length) {
    sendFilters.push(`provider_message_id.in.(${keys.tokens.map((t) => `"${t}"`).join(",")})`);
  }

  const [sendsRes, contactsRes] = await Promise.all([
    sendFilters.length
      ? supabase
          .from("email_sends")
          .select("id, agency_id, household_id, contact_id, enquiry_id, provider_message_id")
          .or(sendFilters.join(","))
          .limit(20)
      : Promise.resolve({ data: [] as MatchableSend[] }),
    supabase
      .from("contacts")
      .select("id, agency_id, household_id, email")
      .ilike("email", msg.fromEmail)
      .limit(20),
  ]);

  const match = matchInbound(msg, keys, {
    sends: (sendsRes.data ?? []) as MatchableSend[],
    contacts: (contactsRes.data ?? []) as MatchableContact[],
  });

  // ─── Record it, matched or not ──────────────────────────────────────────
  // Insert first: the unique index on message_id is what makes a provider
  // retry harmless. If this returns nothing, we have already handled it.
  const { data: inboundRow, error: inboundErr } = await supabase
    .from("email_inbound")
    .upsert(
      {
        agency_id: match.agencyId,
        household_id: match.householdId,
        contact_id: match.contactId,
        enquiry_id: match.enquiryId,
        reply_to_send_id: match.sendId,
        from_email: msg.fromEmail,
        from_name: msg.fromName,
        to_email: msg.toEmail,
        subject: msg.subject,
        body: msg.body,
        raw_body: msg.rawBody,
        message_id: msg.messageId,
        in_reply_to: msg.inReplyTo,
        matched_by: match.matchedBy,
        match_reason: match.reason,
        is_auto_reply: msg.isAutoReply,
        received_at: new Date().toISOString(),
      },
      { onConflict: "message_id", ignoreDuplicates: true }
    )
    .select("id")
    .maybeSingle();

  if (inboundErr) {
    console.error("[email/inbound] could not record message:", inboundErr.message);
    return NextResponse.json({ ok: true, handled: 0 });
  }
  if (!inboundRow) {
    // Same message, second delivery. Already on the timeline.
    return NextResponse.json({ ok: true, handled: 0, note: "Already seen" });
  }

  if (!match.agencyId) {
    // Parked, not lost. Settings counts these, so a misconfigured inbound
    // domain shows up as a number rather than as silence.
    console.warn(`[email/inbound] unmatched reply from ${msg.fromEmail}: ${match.reason}`);
    return NextResponse.json({ ok: true, handled: 1, matched: false });
  }

  // ─── On the timeline, where an agent will actually see it ───────────────
  const { data: ix } = await supabase
    .from("interactions")
    .insert({
      agency_id: match.agencyId,
      household_id: match.householdId,
      contact_id: match.contactId,
      kind: "email_in",
      channel: "email",
      direction: "inbound",
      subject: msg.subject,
      body: msg.body,
      body_summary: msg.isAutoReply ? "Automatic reply — not an answer from a person." : null,
      // Unread and untriaged: it belongs in the queue, not quietly filed.
      is_read: false,
      is_triaged: false,
      // The runner reads this to know an out-of-office is not a reply.
      metadata: {
        auto_reply: msg.isAutoReply,
        matched_by: match.matchedBy,
        from_email: msg.fromEmail,
        message_id: msg.messageId,
      },
      occurred_at: new Date().toISOString(),
    })
    .select("id")
    .maybeSingle();

  const interactionId = (ix?.id as string | undefined) ?? null;
  if (interactionId) {
    await supabase.from("email_inbound").update({ interaction_id: interactionId }).eq("id", inboundRow.id);
  }

  // ─── The send they answered ─────────────────────────────────────────────
  if (match.sendId && countsAsReply(msg)) {
    await supabase
      .from("email_sends")
      .update({ replied_at: new Date().toISOString() })
      .eq("id", match.sendId)
      .eq("agency_id", match.agencyId);
  }

  await emitEvent(supabase, match.agencyId, {
    type: countsAsReply(msg) ? "email.replied" : "email.auto_replied",
    subjectType: "email",
    subjectId: match.sendId ?? inboundRow.id,
    householdId: match.householdId,
    payload: {
      from: msg.fromEmail,
      subject: msg.subject,
      matched_by: match.matchedBy,
      reason: match.reason,
      auto_reply: msg.isAutoReply,
    },
  });

  return NextResponse.json({ ok: true, handled: 1, matched: true, matchedBy: match.matchedBy });
}
