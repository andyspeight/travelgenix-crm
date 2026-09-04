/**
 * The emails that carry a traveller into the portal.
 *
 * Three moments, one shape: a short, plain message from the AGENCY with a
 * single link that lands the customer on the right screen, already signed in.
 *
 *   quote_ready    the agent has sent a quote — here it is, decide when ready
 *   quote_nudge    it has been sitting there (Quote Rescue's "still thinking?")
 *   trip_booked    it's confirmed — here is your trip
 *
 * These go through the ONE send pipeline (lib/email/send), so they carry the
 * agency's identity, respect suppressions, and land on the CRM timeline —
 * unlike a bare sign-in link, an agent wants to see that this went out.
 * Operational, not marketing: a customer who asked for a quote has asked to
 * hear the answer.
 *
 * The copy is deliberately plain. No countdown, no pressure, no exclamation
 * marks; the agent's own words are in the quote itself.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { sendCrmEmail, type SendOutcome } from "@/lib/email/send";
import { formatMoney, formatRange } from "@/lib/portal/format";

export type PortalEmailKind = "quote_ready" | "quote_nudge" | "trip_booked";

/** Stands in for the real link on the CRM's own copy. Never a working URL. */
const LINK_PLACEHOLDER = "[secure one-time link, not stored]";

export type PortalEmailArgs = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>;
  agencyId: string;
  kind: PortalEmailKind;
  /** The signed-in-on-arrival link (lib/portal/invite). */
  link: string;
  toContactId: string;
  householdId: string;
  agencyName: string;
  firstName: string | null;
  /** Destination, dates and price, for a subject line that reads like a person wrote it. */
  destination: string | null;
  departDate: string | null;
  returnDate: string | null;
  price?: number | null;
  currency?: string;
};

export async function sendPortalEmail(args: PortalEmailArgs): Promise<SendOutcome> {
  const copy = compose(args);
  // The sent body carries a single-use login token. The RECORDED body must not:
  // it would otherwise sit at rest in interactions and email_sends, and every
  // agent who opened the customer's timeline would be looking at a working
  // link into that customer's portal. The record keeps everything else, so an
  // agent can still see exactly what was said.
  const redacted = compose({ ...args, link: LINK_PLACEHOLDER });
  return sendCrmEmail({
    supabase: args.supabase,
    agencyId: args.agencyId,
    contactId: args.toContactId,
    householdId: args.householdId,
    subject: copy.subject,
    body: copy.text,
    bodyHtml: copy.html,
    recordBody: redacted.text,
    recordBodyHtml: redacted.html,
    purpose: "operational",
    context: `portal:${args.kind}`,
  });
}

type Copy = { subject: string; text: string; html: string };

/** Pure: the words for one of the three moments. Exported for tests. */
export function compose(args: PortalEmailArgs): Copy {
  const trip = args.destination || "your trip";
  const dates = formatRange(args.departDate, args.returnDate);
  const greeting = args.firstName ? `Hi ${args.firstName},` : "Hi,";
  const price = args.price != null ? formatMoney(args.price, args.currency ?? "GBP") : "";

  let subject: string;
  let opening: string;
  let cta: string;
  let closing: string;

  if (args.kind === "quote_ready") {
    subject = `Your quote for ${trip}`;
    opening = [
      `Your quote for ${trip}${dates ? `, ${dates}` : ""} is ready to look at`,
      price ? ` — ${price} for the party` : "",
      ".",
    ].join("");
    cta = "View your quote";
    closing =
      "You can accept it there when you're ready, or tell us what you'd like changed. Nothing is charged online.";
  } else if (args.kind === "quote_nudge") {
    subject = `Still thinking about ${trip}?`;
    opening = `Your quote for ${trip}${dates ? `, ${dates}` : ""} is still open, and we didn't want it to slip past you.`;
    cta = "View your quote";
    closing =
      "If the dates or the budget aren't right, say so and we'll look again — that's what we're here for.";
  } else {
    subject = `${trip} is confirmed`;
    opening = `Good news: ${trip}${dates ? `, ${dates}` : ""} is confirmed.`;
    cta = "View your trip";
    closing =
      "Your itinerary, documents and anything left to pay are all on that page, and it stays up to date as we add to it.";
  }

  const text = `${greeting}

${opening}

${cta}: ${args.link}

${closing}

${args.agencyName}`;

  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#141b2c">
<p>${esc(greeting)}</p>
<p>${esc(opening)}</p>
<p><a href="${escAttr(args.link)}" style="display:inline-block;padding:12px 22px;background:#1B2B5B;color:#ffffff;border-radius:8px;text-decoration:none;font-weight:600">${esc(cta)}</a></p>
<p>${esc(closing)}</p>
<p style="color:#4c5a70">${esc(args.agencyName)}</p>
</div>`;

  return { subject, text, html };
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function escAttr(s: string): string {
  return esc(s).replace(/"/g, "&quot;");
}
