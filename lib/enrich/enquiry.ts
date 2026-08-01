/**
 * Enquiry enrichment — the checks an agent would otherwise do by hand, done
 * the moment an enquiry lands.
 *
 * Attio enriches a new contact with company size and LinkedIn. That is the
 * right idea aimed at the wrong industry: none of it matters for a family
 * booking Crete. What matters for them is whether the dates are school
 * holidays (which sets the price band before anyone quotes) and whether
 * everyone's passport will actually be accepted (which is the mistake that
 * ruins a holiday and costs the agency the booking).
 *
 * THIS IS NOT ADVICE, and the wording never pretends otherwise. Every fact
 * quotes the rule it applied and points at what to check. We flag risk; the
 * agent confirms it. Being told "check this, here's why" is useful. Being
 * told "you're fine" by software that was wrong is a disaster.
 *
 * Silence beats a guess: outside the reference data's validity, or where we
 * hold no rule for a destination, nothing is said at all.
 *
 * Pure functions, no I/O.
 */

import {
  SCHOOL_HOLIDAYS,
  COVERED_YEARS,
  passportRuleFor,
  type Holiday,
} from "@/lib/enrich/reference";

export type EnrichmentFact = {
  kind: "school_holiday" | "passport" | "timing";
  /** warn = someone must act; info = worth knowing while quoting. */
  tone: "info" | "warn";
  headline: string;
  detail: string;
  /** The rule or data this came from, so it can be verified not trusted. */
  source: string;
};

export type Traveller = {
  name: string;
  passportExpiry: string | null;
};

export type EnrichInput = {
  destination: string | null;
  departDate: string | null;
  returnDate: string | null;
  adults: number | null;
  children: number | null;
  travellers?: Traveller[];
};

const asDate = (iso: string): Date => new Date(`${iso.slice(0, 10)}T00:00:00Z`);
const overlaps = (aFrom: string, aTo: string, bFrom: string, bTo: string): boolean =>
  asDate(aFrom) <= asDate(bTo) && asDate(bFrom) <= asDate(aTo);

const fmt = (iso: string): string =>
  asDate(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });

/** Whole months between two dates, rounded down — the way a border officer counts. */
function monthsBetween(fromIso: string, toIso: string): number {
  const from = asDate(fromIso);
  const to = asDate(toIso);
  let months =
    (to.getUTCFullYear() - from.getUTCFullYear()) * 12 +
    (to.getUTCMonth() - from.getUTCMonth());
  if (to.getUTCDate() < from.getUTCDate()) months -= 1;
  return months;
}

function schoolHolidayFact(i: EnrichInput): EnrichmentFact | null {
  if (!i.departDate || !i.returnDate) return null;

  // Outside the years our table covers, say nothing rather than imply
  // term-time from missing data.
  const year = asDate(i.departDate).getUTCFullYear();
  if (!COVERED_YEARS.includes(year)) return null;

  const hit: Holiday | undefined = SCHOOL_HOLIDAYS.find((h) =>
    overlaps(i.departDate!, i.returnDate!, h.from, h.to)
  );
  const hasChildren = (i.children ?? 0) > 0;

  if (hit) {
    return {
      kind: "school_holiday",
      tone: "info",
      headline: `These dates fall in ${hit.name}`,
      detail: hasChildren
        ? `${fmt(hit.from)} to ${fmt(hit.to)}. Expect peak pricing and tight availability — worth setting that expectation early, and worth checking whether they can shift either end of the trip.`
        : `${fmt(hit.from)} to ${fmt(hit.to)}. No children on this enquiry, so if they are flexible, moving a few days either side usually costs noticeably less.`,
      source: "English state-school holiday dates",
    };
  }

  if (hasChildren) {
    return {
      kind: "school_holiday",
      tone: "info",
      headline: "Term time, with children travelling",
      detail:
        "These dates sit outside the English school holidays, so pricing should be far better — but the family will need the school's authorisation. Worth raising before they get attached to the price.",
      source: "English state-school holiday dates",
    };
  }

  return null;
}

function passportFacts(i: EnrichInput): EnrichmentFact[] {
  const rule = passportRuleFor(i.destination);
  const travellers = i.travellers ?? [];
  if (!rule || !i.returnDate) return [];

  const facts: EnrichmentFact[] = [];

  for (const t of travellers) {
    if (!t.passportExpiry) continue;
    const margin = monthsBetween(i.returnDate, t.passportExpiry);

    if (margin < 0) {
      facts.push({
        kind: "passport",
        tone: "warn",
        headline: `${t.name}'s passport expires before they get home`,
        detail: `It expires ${fmt(t.passportExpiry)}, before the ${fmt(i.returnDate!)} return. This needs renewing before anything is booked.`,
        source: rule.rule,
      });
    } else if (margin < rule.monthsBeyondReturn) {
      facts.push({
        kind: "passport",
        tone: "warn",
        headline: `${t.name}'s passport may be too close to expiry`,
        detail: `It expires ${fmt(t.passportExpiry)} — ${margin} month${margin === 1 ? "" : "s"} after the return date, where ${rule.monthsBeyondReturn} is usually required. Check this before booking.`,
        source: rule.rule,
      });
    }
  }

  // The 10-year rule catches people out constantly, and we do NOT hold issue
  // dates — so say that plainly rather than implying the check is complete.
  if (rule.tenYearIssueRule && travellers.length > 0) {
    facts.push({
      kind: "passport",
      tone: "info",
      headline: "Check when their passports were issued, not just expiry",
      detail:
        "EU entry also requires a passport issued less than 10 years before the date they travel. Some passports meet the expiry rule and still fail this one. We don't hold issue dates, so this needs asking.",
      source: rule.rule,
    });
  }

  return facts;
}

function timingFact(i: EnrichInput): EnrichmentFact | null {
  if (!i.departDate) return null;
  const days = Math.round(
    (asDate(i.departDate).getTime() - Date.now()) / 86_400_000
  );
  if (days < 0 || days > 42) return null;
  return {
    kind: "timing",
    tone: "warn",
    headline: `Departure is ${days === 0 ? "today" : `in ${days} days`}`,
    detail:
      "Short lead time: availability and price will move quickly, and any passport or visa problem needs finding now rather than next week.",
    source: "Departure date on the enquiry",
  };
}

/**
 * Everything worth knowing about this enquiry, computed. Warnings first —
 * the things that need acting on should not sit below the things that are
 * merely interesting.
 */
export function enrichEnquiry(input: EnrichInput): EnrichmentFact[] {
  const facts: EnrichmentFact[] = [];

  const timing = timingFact(input);
  if (timing) facts.push(timing);

  facts.push(...passportFacts(input));

  const school = schoolHolidayFact(input);
  if (school) facts.push(school);

  return facts.sort((a, b) => (a.tone === b.tone ? 0 : a.tone === "warn" ? -1 : 1));
}
