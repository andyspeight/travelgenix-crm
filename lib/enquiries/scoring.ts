/**
 * Enquiry qualification — deterministic, like lib/scoring/customer.ts.
 *
 * The blueprint's rule (§6): produce SEPARATE scores, "do not collapse
 * everything into one mysterious score". So an enquiry gets four independent
 * reads, each with its own plain-English reason:
 *
 *   likelihood — how likely this enquiry is to become a booking
 *   value      — how commercially significant it is
 *   urgency    — how soon someone needs to act
 *   fit        — how strong the existing relationship is
 *
 * All arithmetic on real fields. A score is null (with an honest reason) when
 * the data isn't there — never estimated. Luna's prose may explain these
 * numbers later; it never invents or overrides them.
 */

import type {
  Enquiry,
  EnquiryScore,
  EnquiryScores,
  Household,
} from "@/lib/supabase/types";

/** The subset of enquiry fields scoring reads — callers can pass a draft. */
export type EnquiryFacts = Pick<
  Enquiry,
  | "destination"
  | "depart_date"
  | "date_flexibility"
  | "duration_nights"
  | "adults"
  | "children"
  | "budget"
  | "budget_basis"
  | "holiday_type"
  | "occasion"
  | "source"
  | "contact_email"
  | "contact_phone"
>;

/** What we know about the household, if the enquiry is linked to one. */
export type RelationshipFacts = Pick<
  Household,
  "lifetime_value" | "trips_count" | "last_booking_at" | "tags"
> | null;

const clamp = (n: number): number => Math.max(5, Math.min(95, Math.round(n)));

const daysBetween = (fromIso: string, toIso: string): number =>
  Math.round(
    (new Date(toIso).getTime() - new Date(fromIso).getTime()) /
      (1000 * 60 * 60 * 24)
  );

// ─── Likelihood to book ─────────────────────────────────────────────────────
// Signals: completeness of intent (they told us when, where and what they can
// spend), a way to reach them, dates being pinned down, and a warm source.

export function scoreLikelihood(
  e: EnquiryFacts,
  rel: RelationshipFacts,
  nowIso: string
): EnquiryScore {
  const hasReach = Boolean(e.contact_email || e.contact_phone);
  if (!hasReach) {
    return {
      score: null,
      reason: "No email or phone captured yet, so conversion can't be read.",
    };
  }

  let score = 40;
  const parts: string[] = [];

  if (e.destination) {
    score += 10;
    parts.push("named destination");
  }
  if (e.depart_date) {
    score += 12;
    parts.push("dates given");
    const days = daysBetween(nowIso, e.depart_date);
    if (days >= 0 && days <= 90 && e.date_flexibility === "fixed") {
      score += 8; // fixed dates inside 3 months = a buyer, not a browser
    }
  }
  if (e.budget != null) {
    score += 14;
    parts.push("budget stated");
  }
  if (e.date_flexibility === "fixed") {
    score += 6;
  }
  if (e.occasion) {
    score += 5;
    parts.push(e.occasion.toLowerCase());
  }
  if (rel && (rel.trips_count ?? 0) > 0) {
    score += 12;
    parts.push("existing customer");
  }
  if (e.source === "referral") {
    score += 8;
    parts.push("referred");
  }

  const detail = parts.length ? parts.join(", ") : "basic details only";
  return {
    score: clamp(score),
    reason: `Based on ${detail}.`,
  };
}

// ─── Potential value ────────────────────────────────────────────────────────
// Reads the stated budget (normalised to a total) against simple bands. No
// budget and no history = null, honestly.

export function scoreValue(
  e: EnquiryFacts,
  rel: RelationshipFacts
): EnquiryScore {
  const party = (e.adults ?? 0) + (e.children ?? 0);
  const total =
    e.budget != null
      ? e.budget_basis === "per_person" && party > 0
        ? e.budget * party
        : e.budget
      : null;

  if (total != null) {
    let score: number;
    if (total >= 10000) score = 92;
    else if (total >= 6000) score = 78;
    else if (total >= 3500) score = 62;
    else if (total >= 2000) score = 45;
    else score = 28;
    const basis =
      e.budget_basis === "per_person" && party > 0
        ? ` (£${Math.round(e.budget!)} per person × ${party})`
        : "";
    return {
      score,
      reason: `Stated budget around £${Math.round(total).toLocaleString("en-GB")}${basis}.`,
    };
  }

  // No budget stated — an existing customer's spending history is the next
  // best honest signal.
  if (rel && (rel.trips_count ?? 0) > 0 && (rel.lifetime_value ?? 0) > 0) {
    const avg = (rel.lifetime_value ?? 0) / Math.max(1, rel.trips_count ?? 1);
    let score: number;
    if (avg >= 6000) score = 70;
    else if (avg >= 3000) score = 55;
    else score = 38;
    return {
      score,
      reason: `No budget stated. Their bookings average £${Math.round(avg).toLocaleString("en-GB")}, so read from history.`,
    };
  }

  return {
    score: null,
    reason: "No budget stated and no booking history to read from.",
  };
}

// ─── Urgency ────────────────────────────────────────────────────────────────
// How soon someone must act: driven by proximity of the travel date, sharpened
// by fixed dates, softened by heavy flexibility.

export function scoreUrgency(e: EnquiryFacts, nowIso: string): EnquiryScore {
  if (!e.depart_date) {
    return {
      score: null,
      reason: "No travel date given, so urgency can't be read from the calendar.",
    };
  }

  const days = daysBetween(nowIso, e.depart_date);
  if (days < 0) {
    return {
      score: 20,
      reason: "The stated travel date has already passed. Check it with the customer.",
    };
  }

  let score: number;
  let when: string;
  if (days <= 14) {
    score = 95;
    when = "under two weeks away";
  } else if (days <= 45) {
    score = 80;
    when = "inside six weeks";
  } else if (days <= 90) {
    score = 62;
    when = "inside three months";
  } else if (days <= 180) {
    score = 42;
    when = "three to six months out";
  } else {
    score = 25;
    when = "over six months out";
  }

  if (e.date_flexibility === "fixed") score += 5;
  if (e.date_flexibility === "very_flexible") score -= 10;

  return {
    score: clamp(score),
    reason: `Departure is ${when}${e.date_flexibility === "fixed" ? " on fixed dates" : e.date_flexibility === "very_flexible" ? ", dates very flexible" : ""}.`,
  };
}

// ─── Relationship fit ───────────────────────────────────────────────────────
// Strength of the existing relationship. A brand-new name scores low — that is
// information, not a judgement (it tells the agent this one needs winning).

export function scoreFit(rel: RelationshipFacts): EnquiryScore {
  if (!rel) {
    return {
      score: 15,
      reason: "New name, no customer record yet. Everything to win.",
    };
  }

  const trips = rel.trips_count ?? 0;
  const ltv = rel.lifetime_value ?? 0;

  let score = 35;
  const parts: string[] = [];

  if (trips >= 5) {
    score += 30;
    parts.push(`${trips} bookings`);
  } else if (trips >= 2) {
    score += 20;
    parts.push(`${trips} bookings`);
  } else if (trips === 1) {
    score += 10;
    parts.push("one booking");
  }

  if (ltv >= 20000) {
    score += 15;
    parts.push(`£${Math.round(ltv).toLocaleString("en-GB")} lifetime`);
  } else if (ltv >= 8000) {
    score += 8;
    parts.push(`£${Math.round(ltv).toLocaleString("en-GB")} lifetime`);
  }

  if ((rel.tags ?? []).some((t) => /vip/i.test(t))) {
    score += 10;
    parts.push("VIP");
  }

  return {
    score: clamp(score),
    reason: parts.length
      ? `Known customer: ${parts.join(", ")}.`
      : "On the books but no bookings yet.",
  };
}

// ─── The full set ───────────────────────────────────────────────────────────

export function scoreEnquiry(
  e: EnquiryFacts,
  rel: RelationshipFacts,
  nowIso: string = new Date().toISOString()
): EnquiryScores {
  return {
    likelihood: scoreLikelihood(e, rel, nowIso),
    value: scoreValue(e, rel),
    urgency: scoreUrgency(e, nowIso),
    fit: scoreFit(rel),
  };
}
