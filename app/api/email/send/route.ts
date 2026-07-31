/**
 * POST /api/email/send — the CRM's one real send path.
 *
 * Body: {
 *   to_email?: string,      // required when no contact_id resolves an address
 *   contact_id?: string,    // preferred: enables the consent check
 *   household_id?: string,  // timeline + event attribution
 *   subject: string,
 *   body: string,           // plain text; travel agents write personal emails
 *   purpose: "operational" | "marketing",
 *   context?: string        // e.g. "inbox_reply", "enquiry_response", "journey"
 * }
 *
 * Every send passes decideSend (lib/email/policy): address present, not
 * suppressed, and — for marketing — a positive consent grant. Refusals come
 * back as 403 with the plain-English reason for the agent. Nothing here is
 * AI and nothing sends without a human having pressed the button.
 *
 * After a successful dispatch: an email_sends audit row, an email_out
 * interaction on the customer timeline (when we know the household), and
 * email.sent on the event spine. When BREVO_API_KEY isn't configured the
 * route answers { not_configured: true } and the UI falls back to mailto.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { apiAgencyId } from "@/lib/auth/session";
import { emailConfigured, sendEmail } from "@/lib/email/providers";
import { resolveSender } from "@/lib/email/sender";
import { decideSend, type SendFacts } from "@/lib/email/policy";
import { currentConsent, channelState, type ConsentLedgerRow } from "@/lib/consent/state";
import { emitEvent } from "@/lib/events/emit";
import { enforceRateLimit, clientKey } from "@/lib/ai/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MAX_SUBJECT = 200;
const MAX_BODY = 10_000;

export async function POST(request: Request) {
  // Not an AI surface, but it IS spend + reputation — meter it the same way.
  const limit = await enforceRateLimit(clientKey(request, "email-send"), 30, 60_000);
  if (!limit.ok) {
    return NextResponse.json(
      { ok: false, error: "Too many sends in a minute. Pause briefly and try again." },
      { status: 429 }
    );
  }

  if (!emailConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        not_configured: true,
        error:
          "Email sending is not configured (SENDGRID_API_KEY or BREVO_API_KEY, plus EMAIL_FROM).",
      },
      { status: 503 }
    );
  }

  let parsed: {
    to_email?: unknown;
    contact_id?: unknown;
    household_id?: unknown;
    subject?: unknown;
    body?: unknown;
    purpose?: unknown;
    context?: unknown;
    enquiry_id?: unknown;
  };
  try {
    parsed = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const subject = typeof parsed.subject === "string" ? parsed.subject.trim() : "";
  const body = typeof parsed.body === "string" ? parsed.body.trim() : "";
  const purpose = parsed.purpose === "marketing" ? "marketing" : "operational";
  const context =
    typeof parsed.context === "string" ? parsed.context.slice(0, 80) : null;
  const contactId =
    typeof parsed.contact_id === "string" && UUID_RE.test(parsed.contact_id)
      ? parsed.contact_id
      : null;
  let householdId =
    typeof parsed.household_id === "string" && UUID_RE.test(parsed.household_id)
      ? parsed.household_id
      : null;
  // What this send is answering. Recorded so that a bounce can put the
  // enquiry back in the queue rather than leaving it marked responded.
  const enquiryId =
    typeof parsed.enquiry_id === "string" && UUID_RE.test(parsed.enquiry_id)
      ? parsed.enquiry_id
      : null;

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

  // ─── Resolve the recipient ────────────────────────────────────────────
  let toEmail =
    typeof parsed.to_email === "string" ? parsed.to_email.trim().toLowerCase() : null;
  let toName: string | null = null;
  let consent: SendFacts["consent"] = "no_contact_record";

  if (contactId) {
    const { data: contact } = await supabase
      .from("contacts")
      .select("id, household_id, first_name, last_name, email")
      .eq("agency_id", agencyId)
      .eq("id", contactId)
      .maybeSingle();
    if (!contact) {
      return NextResponse.json({ ok: false, error: "Contact not found." }, { status: 404 });
    }
    toEmail = (contact.email as string | null)?.toLowerCase() ?? toEmail;
    toName = [contact.first_name, contact.last_name].filter(Boolean).join(" ") || null;
    householdId = householdId ?? (contact.household_id as string);

    // Consent state matters only for marketing, but resolving it here keeps
    // the policy call honest either way.
    const { data: ledger, error: ledgerErr } = await supabase
      .from("consents")
      .select("contact_id, channel, granted, occurred_at, source")
      .eq("agency_id", agencyId)
      .eq("channel", "email")
      .eq("contact_id", contactId);
    if (ledgerErr) {
      // Consents migration absent: fall back to the legacy flag for marketing.
      const { data: legacy } = await supabase
        .from("contacts")
        .select("marketing_opt_in")
        .eq("id", contactId)
        .maybeSingle();
      consent = legacy?.marketing_opt_in ? "granted" : "unknown";
    } else {
      consent = channelState(
        currentConsent((ledger ?? []) as ConsentLedgerRow[]),
        contactId,
        "email"
      ).state;
    }
  }

  // ─── Suppression check ────────────────────────────────────────────────
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
  const decision = decideSend({ purpose, toEmail, consent, suppressed, suppressionReason });
  if (!decision.allowed) {
    return NextResponse.json({ ok: false, error: decision.reason }, { status: 403 });
  }

  // ─── Who it comes from ────────────────────────────────────────────────
  // The agency's identity, not the platform's: the recipient is their
  // customer. Until their domain is authenticated we send from the
  // platform's address under their name, with replies routed to them.
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

  // ─── Dispatch — purpose-routed: operational → SendGrid, marketing →
  // Brevo (each falls back to the other when only one is configured) ─────
  const result = await sendEmail({ purpose, toEmail: toEmail!, toName, subject, text: body, sender });

  // Timeline entry first, so the audit row can point at it — a bounce then
  // has something to correct.
  let interactionId: string | null = null;
  if (result.ok && householdId) {
    const { data: ix } = await supabase
      .from("interactions")
      .insert({
        agency_id: agencyId,
        household_id: householdId,
        contact_id: contactId,
        kind: "email_out",
        channel: "email",
        direction: "outbound",
        subject,
        body,
        is_read: true,
        is_triaged: true,
        occurred_at: new Date().toISOString(),
      })
      .select("id")
      .maybeSingle();
    interactionId = (ix?.id as string | undefined) ?? null;
  }

  // Audit row either way — failed sends are worth seeing too.
  const { data: sendRow } = await supabase
    .from("email_sends")
    .insert({
      agency_id: agencyId,
      household_id: householdId,
      contact_id: contactId,
      to_email: toEmail,
      subject,
      body,
      purpose,
      context,
      status: result.ok ? "sent" : "failed",
      provider: result.ok ? result.provider : null,
      provider_message_id: result.ok ? result.messageId : null,
      error: result.ok ? null : result.error,
      interaction_id: interactionId,
      enquiry_id: enquiryId,
    })
    .select("id")
    .maybeSingle();

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 502 });
  }

  await emitEvent(supabase, agencyId, {
    type: "email.sent",
    subjectType: "email",
    subjectId: sendRow?.id ?? toEmail!,
    householdId,
    payload: { to: toEmail, subject, purpose, context },
  });

  return NextResponse.json({ ok: true, to: toEmail, id: sendRow?.id ?? null });
}
