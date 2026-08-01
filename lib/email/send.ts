/**
 * The one send pipeline.
 *
 * Every email the CRM sends goes through here — the reply an agent types, the
 * journey draft they dispatch, and now a sequence step that goes out on a
 * schedule with nobody watching. That last one is exactly why this is a
 * shared function rather than logic living inside an HTTP route: an
 * unattended sender must pass the same consent check, the same suppression
 * check and the same per-agency identity as a human-pressed one, and the only
 * way to be sure of that is for it to be the same code.
 *
 * Returns a result rather than a Response, so the caller decides what to do
 * about a refusal — a route turns it into a 403, a sequence runner stops the
 * chase and records why.
 */

import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { emailConfigured, sendEmail } from "@/lib/email/providers";
import { resolveSender } from "@/lib/email/sender";
import { decideSend, type SendFacts, type SendPurpose } from "@/lib/email/policy";
import { currentConsent, channelState, type ConsentLedgerRow } from "@/lib/consent/state";
import { emitEvent } from "@/lib/events/emit";

export type SendRequest = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>;
  agencyId: string;
  toEmail?: string | null;
  contactId?: string | null;
  householdId?: string | null;
  enquiryId?: string | null;
  subject: string;
  body: string;
  purpose: SendPurpose;
  context?: string | null;
};

export type SendOutcome =
  | { ok: true; to: string; sendId: string | null }
  | { ok: false; error: string; reason: "not_configured" | "refused" | "provider" | "not_found" };

export async function sendCrmEmail(req: SendRequest): Promise<SendOutcome> {
  const { supabase, agencyId } = req;

  if (!emailConfigured()) {
    return {
      ok: false,
      reason: "not_configured",
      error: "Email sending is not configured (SENDGRID_API_KEY or BREVO_API_KEY, plus EMAIL_FROM).",
    };
  }

  // ─── Recipient + consent ──────────────────────────────────────────────
  let toEmail = req.toEmail ? req.toEmail.trim().toLowerCase() : null;
  let toName: string | null = null;
  let householdId = req.householdId ?? null;
  let consent: SendFacts["consent"] = "no_contact_record";

  if (req.contactId) {
    const { data: contact } = await supabase
      .from("contacts")
      .select("id, household_id, first_name, last_name, email")
      .eq("agency_id", agencyId)
      .eq("id", req.contactId)
      .maybeSingle();
    if (!contact) return { ok: false, reason: "not_found", error: "Contact not found." };

    toEmail = (contact.email as string | null)?.toLowerCase() ?? toEmail;
    toName = [contact.first_name, contact.last_name].filter(Boolean).join(" ") || null;
    householdId = householdId ?? (contact.household_id as string);

    const { data: ledger, error: ledgerErr } = await supabase
      .from("consents")
      .select("contact_id, channel, granted, occurred_at, source")
      .eq("agency_id", agencyId)
      .eq("channel", "email")
      .eq("contact_id", req.contactId);
    if (ledgerErr) {
      const { data: legacy } = await supabase
        .from("contacts")
        .select("marketing_opt_in")
        .eq("id", req.contactId)
        .maybeSingle();
      consent = legacy?.marketing_opt_in ? "granted" : "unknown";
    } else {
      consent = channelState(
        currentConsent((ledger ?? []) as ConsentLedgerRow[]),
        req.contactId,
        "email"
      ).state;
    }
  }

  // ─── Suppression ──────────────────────────────────────────────────────
  let suppressed = false;
  let suppressionReason: string | null = null;
  if (toEmail) {
    const { data: sup } = await supabase
      .from("email_suppressions")
      .select("reason")
      .eq("agency_id", agencyId)
      .eq("email", toEmail)
      .maybeSingle();
    if (sup) {
      suppressed = true;
      suppressionReason = sup.reason as string;
    }
  }

  // ─── The gate ─────────────────────────────────────────────────────────
  const decision = decideSend({
    purpose: req.purpose,
    toEmail,
    consent,
    suppressed,
    suppressionReason,
  });
  if (!decision.allowed) {
    return { ok: false, reason: "refused", error: decision.reason };
  }

  // ─── Who it comes from — the agency, never the platform ───────────────
  const { data: agencyRow } = await supabase
    .from("agencies")
    .select("name, email_from_address, email_from_name, email_reply_to, email_sender_verified")
    .eq("id", agencyId)
    .maybeSingle();

  const sender = resolveSender(
    {
      name: (agencyRow?.name as string | undefined) ?? "",
      emailFromAddress: (agencyRow?.email_from_address as string | null) ?? null,
      emailFromName: (agencyRow?.email_from_name as string | null) ?? null,
      emailReplyTo: (agencyRow?.email_reply_to as string | null) ?? null,
      emailSenderVerified: Boolean(agencyRow?.email_sender_verified),
    },
    {
      address: process.env.EMAIL_FROM!,
      name: process.env.EMAIL_FROM_NAME || "Luna Work",
    }
  );

  // ─── Making the reply findable ────────────────────────────────────────
  // A reply is only useful if we can tell WHICH message it answers. Thread
  // headers are unreliable across providers, so when an inbound domain is
  // configured we carry the id in the reply address itself:
  //   Reply-To: reply+<sendId>@<inbound domain>
  // That means generating the id here rather than letting the database do it.
  //
  // An agency that has set its own reply-to has said where it wants replies,
  // and we respect that — their mail goes to their inbox and the CRM will not
  // see it. Settings says so rather than leaving anyone to discover it.
  const sendId = randomUUID();
  const inboundDomain = process.env.EMAIL_INBOUND_DOMAIN?.trim();
  const agencyChoseReplyTo = Boolean((agencyRow?.email_reply_to as string | null)?.trim());
  const replyTo =
    inboundDomain && !agencyChoseReplyTo ? `reply+${sendId}@${inboundDomain}` : sender.replyTo;

  const result = await sendEmail({
    purpose: req.purpose,
    toEmail: toEmail!,
    toName,
    subject: req.subject,
    text: req.body,
    sender: { ...sender, replyTo },
  });

  // ─── Record: timeline first, so the audit row can point at it ─────────
  let interactionId: string | null = null;
  if (result.ok && householdId) {
    const { data: ix } = await supabase
      .from("interactions")
      .insert({
        agency_id: agencyId,
        household_id: householdId,
        contact_id: req.contactId ?? null,
        kind: "email_out",
        channel: "email",
        direction: "outbound",
        subject: req.subject,
        body: req.body,
        is_read: true,
        is_triaged: true,
        occurred_at: new Date().toISOString(),
      })
      .select("id")
      .maybeSingle();
    interactionId = (ix?.id as string | undefined) ?? null;
  }

  const { data: sendRow } = await supabase
    .from("email_sends")
    .insert({
      // Fixed above, because the reply address quotes it.
      id: sendId,
      agency_id: agencyId,
      household_id: householdId,
      contact_id: req.contactId ?? null,
      to_email: toEmail,
      subject: req.subject,
      body: req.body,
      purpose: req.purpose,
      context: req.context ?? null,
      status: result.ok ? "sent" : "failed",
      provider: result.ok ? result.provider : null,
      provider_message_id: result.ok ? result.messageId : null,
      error: result.ok ? null : result.error,
      interaction_id: interactionId,
      enquiry_id: req.enquiryId ?? null,
    })
    .select("id")
    .maybeSingle();

  if (!result.ok) {
    return { ok: false, reason: "provider", error: result.error };
  }

  await emitEvent(supabase, agencyId, {
    type: "email.sent",
    subjectType: "email",
    subjectId: (sendRow?.id as string | undefined) ?? toEmail!,
    householdId,
    payload: { to: toEmail, subject: req.subject, purpose: req.purpose, context: req.context },
  });

  return { ok: true, to: toEmail!, sendId: (sendRow?.id as string | undefined) ?? null };
}
