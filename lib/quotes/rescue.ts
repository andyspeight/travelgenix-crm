/**
 * Quote Rescue — the deterministic at-risk detector (blueprint differentiator
 * 3: "LUNA identifies quotes at risk and recommends the best intervention").
 *
 * Same discipline as lib/scoring/customer.ts and lib/enquiries/scoring.ts:
 * every alert is arithmetic on real fields, every alert explains itself, and
 * the recommended intervention follows from WHICH signal fired — engagement
 * without response wants a call, silence wants a nudge, an expiry wants a
 * decision. No AI in the maths; Luna's prose may narrate these later.
 *
 * Pure functions, no I/O.
 */

import type { Quote } from "@/lib/supabase/types";

/** The live statuses a rescue can still save. */
export const OPEN_QUOTE_STATUSES = ["sent", "viewed"] as const;

export type RescueAction = "call" | "nudge" | "decide_expiry" | "revise";

export type RescueAlert = {
  quoteId: string;
  tripId: string;
  householdId: string | null;
  /** 1 = keep an eye, 2 = act today, 3 = act now */
  severity: 1 | 2 | 3;
  title: string;
  reason: string;
  action: RescueAction;
  actionLabel: string;
  /** Machine-readable signal keys that fired, for tests + narration. */
  signals: string[];
};

/** Trip context the detector needs (departure pressure). */
export type QuoteTripContext = {
  depart_date: string | null;
  destination: string | null;
};

const DAY_MS = 86_400_000;

const daysBetween = (fromIso: string, toIso: string): number =>
  Math.floor((new Date(toIso).getTime() - new Date(fromIso).getTime()) / DAY_MS);

const money = (n: number | null): string =>
  n != null ? `£${Math.round(n).toLocaleString("en-GB")}` : "an unpriced";

/**
 * Assess one open quote. Returns null when nothing needs rescuing — a quote
 * sent yesterday that hasn't been read yet is just a quote, not a risk.
 */
export function assessQuote(
  q: Quote,
  trip: QuoteTripContext | null,
  nowIso: string
): RescueAlert | null {
  if (!OPEN_QUOTE_STATUSES.includes(q.status as (typeof OPEN_QUOTE_STATUSES)[number])) {
    return null;
  }

  const signals: string[] = [];
  let severity = 0;
  let action: RescueAction = "nudge";

  const sentDays = q.sent_at ? daysBetween(q.sent_at, nowIso) : null;
  const viewedDays = q.viewed_at ? daysBetween(q.viewed_at, nowIso) : null;
  const expiryDays = q.expires_at ? daysBetween(nowIso, q.expires_at) : null;
  const departDays = trip?.depart_date ? daysBetween(nowIso, trip.depart_date) : null;
  const highValue = (q.total_price ?? 0) >= 5000;

  // ─── Signals, roughly strongest first ─────────────────────────────

  // Expiry pressure: the quote dies soon (or already has, unmarked).
  if (expiryDays != null && expiryDays < 0) {
    signals.push("expired_unmarked");
    severity = Math.max(severity, 3);
    action = "decide_expiry";
  } else if (expiryDays != null && expiryDays <= 3) {
    signals.push("expiring_soon");
    severity = Math.max(severity, 3);
    action = "decide_expiry";
  }

  // Engaged but silent: they keep reading it and haven't said anything.
  // The strongest buying signal a quote gets — this one wants a phone call.
  if (q.status === "viewed" && q.view_count >= 3 && !q.customer_response) {
    signals.push("engaged_no_response");
    severity = Math.max(severity, highValue ? 3 : 2);
    if (action !== "decide_expiry") action = "call";
  }

  // Viewed once, then silence.
  if (
    q.status === "viewed" &&
    q.view_count < 3 &&
    viewedDays != null &&
    viewedDays >= 4 &&
    !q.customer_response
  ) {
    signals.push("gone_quiet_after_viewing");
    severity = Math.max(severity, 2);
  }

  // Sent and never opened.
  if (q.status === "sent" && sentDays != null && sentDays >= 3) {
    signals.push("never_viewed");
    severity = Math.max(severity, sentDays >= 7 ? 2 : 1);
  }

  // Departure pressure: availability risk grows as the date nears.
  if (departDays != null && departDays >= 0 && departDays <= 45) {
    signals.push("departure_approaching");
    severity = Math.max(severity, departDays <= 21 ? 3 : 2);
  }

  if (signals.length === 0 || severity === 0) return null;

  // ─── Compose the human story from what actually fired ─────────────

  const where = trip?.destination ?? "their trip";
  const price = money(q.total_price);

  let title: string;
  let reason: string;

  if (signals.includes("expired_unmarked")) {
    title = `${price} quote for ${where} has expired`;
    reason = `It lapsed ${Math.abs(expiryDays!)} day${Math.abs(expiryDays!) === 1 ? "" : "s"} ago with no decision recorded. Re-price and re-send, or close it out.`;
  } else if (signals.includes("expiring_soon")) {
    title = `${price} quote for ${where} expires in ${expiryDays} day${expiryDays === 1 ? "" : "s"}`;
    reason = q.view_count > 0
      ? `The customer has opened it ${q.view_count} time${q.view_count === 1 ? "" : "s"} but hasn't confirmed. The expiry is your reason to pick up the phone today.`
      : `It hasn't been opened and it dies in ${expiryDays} day${expiryDays === 1 ? "" : "s"}. Chase it or extend it before it lapses unseen.`;
  } else if (signals.includes("engaged_no_response")) {
    title = `${price} quote for ${where} viewed ${q.view_count} times, no reply`;
    reason = `They keep coming back to it${viewedDays != null ? ` (last look ${viewedDays === 0 ? "today" : `${viewedDays} day${viewedDays === 1 ? "" : "s"} ago`})` : ""}. That's interest with an unanswered question in it. Call, don't email.`;
  } else if (signals.includes("gone_quiet_after_viewing")) {
    title = `${price} quote for ${where} has gone quiet`;
    reason = `Viewed ${viewedDays} days ago, nothing since. A short check-in keeps it warm without pressure.`;
  } else if (signals.includes("never_viewed")) {
    title = `${price} quote for ${where} still unopened`;
    reason = `Sent ${sentDays} days ago and never viewed. Check it landed (spam, wrong address) before assuming disinterest.`;
  } else {
    // Only departure pressure fired.
    title = `${price} quote for ${where} departs in ${departDays} days`;
    reason = `The travel date is close enough that price and availability drift daily. Push for a decision.`;
  }

  if (signals.includes("departure_approaching") && !title.includes("departs")) {
    reason += ` Departure is ${departDays} days out, so availability risk is rising.`;
  }

  // "revise" is reserved for when price-change tracking wires in.
  const actionLabel =
    action === "call"
      ? "Call them today"
      : action === "decide_expiry"
        ? "Extend or close"
        : "Send a nudge";

  return {
    quoteId: q.id,
    tripId: q.trip_id,
    householdId: q.household_id,
    severity: severity as 1 | 2 | 3,
    title,
    reason,
    action,
    actionLabel,
    signals,
  };
}

/** Assess a set of quotes, most urgent first (severity, then value). */
export function rescueAlerts(
  quotes: Quote[],
  tripsById: Map<string, QuoteTripContext>,
  nowIso: string = new Date().toISOString()
): RescueAlert[] {
  const valueById = new Map(quotes.map((q) => [q.id, q.total_price ?? 0]));
  return quotes
    .map((q) => assessQuote(q, tripsById.get(q.trip_id) ?? null, nowIso))
    .filter((a): a is RescueAlert => a !== null)
    .sort(
      (a, b) =>
        b.severity - a.severity ||
        (valueById.get(b.quoteId) ?? 0) - (valueById.get(a.quoteId) ?? 0)
    );
}
