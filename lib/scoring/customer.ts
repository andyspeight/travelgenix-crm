/**
 * Customer scoring — the DETERMINISTIC half of the Luna Work AI engine.
 *
 * Why deterministic, not AI: these scores drive real agent actions. If Luna
 * says a passport is fine and it isn't, an agent sends a family to an airport
 * to be turned away. So Risk and Opportunity are computed from real fields with
 * plain arithmetic — trustworthy, explainable, free, and never hallucinated.
 *
 * The AI half (the prose brief and the destination-match reasoning) lives in
 * the brief route and is GROUNDED in the numbers this module produces. The LLM
 * never invents a score; it explains the ones computed here.
 */

import type { Contact, Trip, Household } from "@/lib/supabase/types";
import { daysUntil } from "@/lib/trips/presentation";

// ─── Risk ────────────────────────────────────────────────────────────────
// Hard facts only: passport validity against planned travel, GDPR/marketing
// consent, supplier flags noted on contacts. No estimation, ever.

export type RiskLevel = "Low" | "Medium" | "High";

export type RiskResult = {
  level: RiskLevel;
  fill: number; // 0–100 for the bar
  title: string; // headline shown on the card
  reason: string; // one-line explanation
  flags: string[]; // machine-readable issues, for the brief + audit
};

/**
 * Most airlines/countries require a passport valid for 6 months beyond travel.
 * We treat <6 months margin on a planned trip date as a real risk.
 */
const PASSPORT_MARGIN_DAYS = 183;

export function computeRisk(
  contacts: Contact[],
  trips: Trip[]
): RiskResult {
  const flags: string[] = [];

  // Future-dated travel only — past trips can't carry passport risk.
  const futureTrips = trips.filter((t) => {
    if (t.stage === "cancelled" || t.stage === "returned") return false;
    const d = daysUntil(t.depart_date);
    return d != null && d >= 0;
  });

  // Passport checks against the furthest-out planned trip.
  const passportContacts = contacts.filter((c) => c.passport_expiry);
  const missingPassport = contacts.filter((c) => !c.passport_expiry);

  let worstMarginDays: number | null = null;

  for (const trip of futureTrips) {
    const departDays = daysUntil(trip.depart_date);
    if (departDays == null) continue;
    for (const c of passportContacts) {
      const expiryDays = daysUntil(c.passport_expiry);
      if (expiryDays == null) continue;
      // Margin = days between departure and passport expiry.
      const margin = expiryDays - departDays;
      if (worstMarginDays == null || margin < worstMarginDays) {
        worstMarginDays = margin;
      }
      if (margin < 0) {
        flags.push(
          `${c.first_name}'s passport expires before ${trip.destination ?? "a planned trip"}`
        );
      } else if (margin < PASSPORT_MARGIN_DAYS) {
        flags.push(
          `${c.first_name}'s passport has under 6 months margin for ${trip.destination ?? "a planned trip"}`
        );
      }
    }
  }

  if (missingPassport.length > 0 && futureTrips.length > 0) {
    flags.push(
      `${missingPassport.length} traveller${missingPassport.length > 1 ? "s have" : " has"} no passport on file`
    );
  }

  // Consent / compliance.
  const noConsent = contacts.filter((c) => !c.gdpr_consent);
  if (noConsent.length === contacts.length && contacts.length > 0) {
    flags.push("No GDPR consent recorded for this household");
  }

  // Supplier / contact flags surfaced verbatim (e.g. "complaint 2024").
  for (const c of contacts) {
    for (const f of c.flags ?? []) {
      flags.push(`${c.first_name}: ${f}`);
    }
  }

  // ─── Decide level ──────────────────────────────────────────────────
  const hasExpiredForTrip =
    worstMarginDays != null && worstMarginDays < 0;
  const hasThinMargin =
    worstMarginDays != null &&
    worstMarginDays >= 0 &&
    worstMarginDays < PASSPORT_MARGIN_DAYS;

  let level: RiskLevel;
  let fill: number;
  let title: string;
  let reason: string;

  if (hasExpiredForTrip) {
    level = "High";
    fill = 88;
    title = "Passport expires before travel";
    reason = flags[0] ?? "A passport will be expired on a planned trip date.";
  } else if (hasThinMargin || (missingPassport.length > 0 && futureTrips.length > 0)) {
    level = "Medium";
    fill = 52;
    title = hasThinMargin ? "Passport margin is tight" : "Passport details missing";
    reason =
      flags.find((f) => f.includes("passport")) ??
      "Check passport validity before the next booking.";
  } else if (flags.length > 0) {
    level = "Medium";
    fill = 40;
    title = "Items to review";
    reason = flags[0];
  } else {
    level = "Low";
    fill = 18;
    title = "No flags";
    // Phrase honestly based on what we actually checked.
    if (passportContacts.length > 0 && futureTrips.length > 0) {
      const months = worstMarginDays
        ? Math.floor(worstMarginDays / 30)
        : null;
      reason =
        months != null
          ? `Passports valid with ${months}+ months margin on every planned trip date.`
          : "Passport, supplier history and compliance all clear.";
    } else {
      reason = "Passport, supplier history and compliance all clear.";
    }
  }

  return { level, fill, title, reason, flags };
}

// ─── Opportunity ───────────────────────────────────────────────────────────
// Rebooking likelihood from booking cadence + recency + value. A signal model,
// not a crystal ball — we only show a confident % when there's enough history.

export type OpportunityResult = {
  confidence: number | null; // 0–100, or null when insufficient history
  fill: number;
  title: string;
  reason: string;
};

export function computeOpportunity(
  household: Household,
  trips: Trip[]
): OpportunityResult {
  // Completed/active bookings (not enquiries that never converted, not cancels).
  const realTrips = trips.filter(
    (t) => t.stage !== "enquiry" && t.stage !== "cancelled"
  );

  // Need at least 3 bookings to talk about a pattern with a straight face.
  if (realTrips.length < 3) {
    return {
      confidence: null,
      fill: 0,
      title: "Likely next booking",
      reason: `Insufficient history to predict yet — ${realTrips.length} of 3+ bookings needed.`,
    };
  }

  // Sort by departure to look at cadence.
  const dated = realTrips
    .filter((t) => t.depart_date)
    .sort(
      (a, b) =>
        new Date(a.depart_date!).getTime() - new Date(b.depart_date!).getTime()
    );

  // Months since last booking activity.
  const lastBooking = household.last_booking_at
    ? new Date(household.last_booking_at)
    : dated.length
      ? new Date(dated[dated.length - 1].depart_date!)
      : null;
  const monthsSinceLast = lastBooking
    ? Math.round((Date.now() - lastBooking.getTime()) / (1000 * 60 * 60 * 24 * 30))
    : null;

  // Average gap between trips (months).
  let avgGapMonths: number | null = null;
  if (dated.length >= 2) {
    const gaps: number[] = [];
    for (let i = 1; i < dated.length; i++) {
      const gap =
        (new Date(dated[i].depart_date!).getTime() -
          new Date(dated[i - 1].depart_date!).getTime()) /
        (1000 * 60 * 60 * 24 * 30);
      gaps.push(gap);
    }
    avgGapMonths = gaps.reduce((s, g) => s + g, 0) / gaps.length;
  }

  // Scoring: start from a base for an established repeat customer, then adjust
  // for how "due" they are vs their own cadence, and for value tier.
  let score = 55;

  if (avgGapMonths != null && monthsSinceLast != null) {
    const dueRatio = monthsSinceLast / avgGapMonths; // ~1 means right on cadence
    if (dueRatio >= 0.8 && dueRatio <= 1.4) score += 25; // in the booking window
    else if (dueRatio > 1.4 && dueRatio <= 2.2) score += 10; // slightly overdue, still warm
    else if (dueRatio > 2.2) score -= 15; // long lapsed, cooling
    else score -= 5; // booked very recently, not due yet
  }

  // Loyalty / value nudges.
  if (realTrips.length >= 5) score += 8;
  if ((household.lifetime_value ?? 0) >= 20000) score += 7;
  if ((household.tags ?? []).some((t) => /vip/i.test(t))) score += 5;

  const confidence = Math.max(20, Math.min(95, Math.round(score)));

  // A human-readable reason grounded in the real cadence.
  const cadenceText =
    avgGapMonths != null
      ? `Books roughly every ${Math.round(avgGapMonths)} months`
      : "Repeat booker";
  const dueText =
    avgGapMonths != null && monthsSinceLast != null
      ? monthsSinceLast >= avgGapMonths * 0.8
        ? " and is in their usual booking window now."
        : ` (last booked ${monthsSinceLast} months ago).`
      : ".";

  return {
    confidence,
    fill: confidence,
    title:
      confidence >= 65
        ? "Strong rebooking signal"
        : confidence >= 45
          ? "Moderate rebooking signal"
          : "Cooling — worth a nudge",
    reason: `${cadenceText}${dueText}`,
  };
}

// ─── Compact data digest for the AI brief ──────────────────────────────────
// Everything the LLM is allowed to know, in structured form. The brief route
// passes ONLY this to the model — never raw DB rows, never IDs, never PII it
// doesn't need. This is the fact whitelist.

export type ScoringContext = {
  risk: RiskResult;
  opportunity: OpportunityResult;
};

export function buildScoringContext(
  household: Household,
  contacts: Contact[],
  trips: Trip[]
): ScoringContext {
  return {
    risk: computeRisk(contacts, trips),
    opportunity: computeOpportunity(household, trips),
  };
}
