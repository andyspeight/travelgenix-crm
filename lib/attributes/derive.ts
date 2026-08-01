/**
 * Derived attributes — the facts about a customer that nobody typed in.
 *
 * The CRM already works these out: whose passport will not make it, who has
 * gone quiet, who is due to book again. They have been display-only — a badge
 * on a record, a line in a panel — which means an agent can SEE that Rachel's
 * passport is tight but cannot ask for everyone in that position and write to
 * them all.
 *
 * This makes them first-class: something to filter by, something to act on in
 * bulk, something a saved segment can be built from.
 *
 * NOTHING HERE IS STORED. Every attribute is computed on read, from the rows
 * as they are right now.
 *
 * That is the deliberate difference from an AI-filled field. A value written
 * into a record is true on the day it is written and drifts quietly for ever
 * after: the passport gets renewed, the customer books, and the field still
 * says what it said in March. A derived attribute cannot go stale, cannot be
 * silently wrong, and cannot be edited into something the data does not
 * support. The cost is that it must be recomputed, which for an agency's book
 * of customers is nothing.
 *
 * EVERY ATTRIBUTE CARRIES ITS REASON, built from the real values — the date,
 * the count, the destination. "Passport risk" on its own is an accusation;
 * "Sam's passport expires 12 Sept, three weeks after they get back" is a fact
 * an agent can act on or dismiss.
 *
 * WHERE THE DATA IS MISSING, THE ATTRIBUTE DOES NOT APPLY. A customer with no
 * passport date recorded is not "passport risk"; they are "passport not on
 * file", which is a different problem with a different fix.
 *
 * Pure functions, no I/O.
 */

export type AttributeId =
  | "departing_soon"
  | "travelling_now"
  | "passport_risk"
  | "passport_unknown"
  | "gone_quiet"
  | "rebooking_window"
  | "unreachable"
  | "no_marketing_consent"
  | "never_travelled"
  | "open_quote";

export type AttributeTone = "warn" | "info" | "opportunity";

export type AttributeDef = {
  id: AttributeId;
  label: string;
  /** How it is worked out. Shown in the UI so no filter is a mystery. */
  description: string;
  tone: AttributeTone;
};

export const ATTRIBUTES: AttributeDef[] = [
  {
    id: "departing_soon",
    label: "Departing soon",
    description: "A booked trip leaving in the next 30 days.",
    tone: "info",
  },
  {
    id: "travelling_now",
    label: "Travelling now",
    description: "Away right now, between their departure and return dates.",
    tone: "info",
  },
  {
    id: "passport_risk",
    label: "Passport risk",
    description:
      "A traveller's passport expires within six months of their return date — the margin most countries ask for.",
    tone: "warn",
  },
  {
    id: "passport_unknown",
    label: "Passport not on file",
    description: "A trip is coming up and we hold no passport expiry for at least one traveller.",
    tone: "warn",
  },
  {
    id: "gone_quiet",
    label: "Gone quiet",
    description: "No contact either way for six months, and nothing booked.",
    tone: "info",
  },
  {
    id: "rebooking_window",
    label: "Due to book again",
    description: "Back from their last trip 9 to 15 months ago, with nothing booked since.",
    tone: "opportunity",
  },
  {
    id: "unreachable",
    label: "Can't be reached",
    description: "No working email or phone number on file, or their email is bouncing.",
    tone: "warn",
  },
  {
    id: "no_marketing_consent",
    label: "No marketing consent",
    description: "Not opted in, so they can't be included in a campaign.",
    tone: "info",
  },
  {
    id: "never_travelled",
    label: "Never travelled",
    description: "On the books but has never been away with you.",
    tone: "info",
  },
  {
    id: "open_quote",
    label: "Quote out",
    description: "A quote is with them and hasn't been answered.",
    tone: "info",
  },
];

export const findAttribute = (id: string): AttributeDef | undefined =>
  ATTRIBUTES.find((a) => a.id === id);

export type DerivedAttribute = {
  id: AttributeId;
  label: string;
  tone: AttributeTone;
  /** Built from the real values, so it can be checked or dismissed. */
  reason: string;
};

export type DeriveInput = {
  now: Date;
  household: {
    lifetime_value?: number | null;
    last_booking_at?: string | null;
    trips_count?: number | null;
  };
  contacts: {
    first_name: string;
    email?: string | null;
    phone?: string | null;
    passport_expiry?: string | null;
  }[];
  trips: {
    stage: string;
    depart_date?: string | null;
    return_date?: string | null;
    destination?: string | null;
  }[];
  /** Most recent interaction either way. */
  lastContactAt?: string | null;
  /** A quote sent or viewed and not yet answered. */
  hasLiveQuote?: boolean;
  /** Any of their addresses on the do-not-send list. */
  emailSuppressed?: boolean;
  /** From the consent ledger. Unknown is not the same as refused. */
  marketingConsent?: "granted" | "refused" | "unknown";
};

const DAY = 86_400_000;
const asDate = (iso: string): Date => new Date(`${iso.slice(0, 10)}T00:00:00Z`);
const daysBetween = (from: Date, to: Date): number =>
  Math.round((to.getTime() - from.getTime()) / DAY);

const fmt = (iso: string): string =>
  asDate(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });

/** Months between, rounded down — the way a person counts them. */
function monthsBetween(fromIso: string, to: Date): number {
  const from = asDate(fromIso);
  let months = (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + (to.getUTCMonth() - from.getUTCMonth());
  if (to.getUTCDate() < from.getUTCDate()) months -= 1;
  return months;
}

const LIVE_STAGES = new Set(["booked", "pre_departure", "travelling"]);

export function deriveAttributes(i: DeriveInput): DerivedAttribute[] {
  const out: DerivedAttribute[] = [];
  const add = (id: AttributeId, reason: string) => {
    const def = findAttribute(id)!;
    out.push({ id, label: def.label, tone: def.tone, reason });
  };

  // ─── Where they are ─────────────────────────────────────────────────────
  const travelling = i.trips.find((t) => t.stage === "travelling");
  if (travelling) {
    add(
      "travelling_now",
      travelling.destination
        ? `In ${travelling.destination} now${travelling.return_date ? `, back ${fmt(travelling.return_date)}` : ""}.`
        : "Away at the moment."
    );
  }

  const upcoming = i.trips
    .filter((t) => LIVE_STAGES.has(t.stage) && t.depart_date && asDate(t.depart_date) >= i.now)
    .sort((a, b) => asDate(a.depart_date!).getTime() - asDate(b.depart_date!).getTime());

  const next = upcoming[0];
  if (next?.depart_date) {
    const days = daysBetween(i.now, asDate(next.depart_date));
    if (days <= 30) {
      add(
        "departing_soon",
        `${next.destination ?? "Their trip"} leaves in ${days} day${days === 1 ? "" : "s"}, on ${fmt(next.depart_date)}.`
      );
    }
  }

  // ─── Passports, against the trip they are actually taking ───────────────
  const journey = next ?? travelling;
  const journeyEnd = journey?.return_date ?? journey?.depart_date ?? null;

  if (journey && journeyEnd) {
    const tight: string[] = [];
    const missing: string[] = [];

    for (const contact of i.contacts) {
      if (!contact.passport_expiry) {
        missing.push(contact.first_name);
        continue;
      }
      // Six months beyond the return date is the margin most countries ask
      // for. The destination-specific rule lives in lib/enrich; this is the
      // broad sweep that finds who to look at.
      const margin = monthsBetween(journeyEnd, asDate(contact.passport_expiry));
      if (margin < 6) {
        tight.push(`${contact.first_name}'s expires ${fmt(contact.passport_expiry)}`);
      }
    }

    if (tight.length) {
      add(
        "passport_risk",
        `Back ${fmt(journeyEnd)}. ${tight.join("; ")} — under the six months most countries ask for.`
      );
    }
    if (missing.length) {
      add(
        "passport_unknown",
        `${journey.destination ?? "A trip"} is coming up and we hold no passport expiry for ${missing.join(", ")}.`
      );
    }
  }

  // ─── Whether we can reach them at all ───────────────────────────────────
  const reachable = i.contacts.some((c) => (c.email ?? "").trim() || (c.phone ?? "").trim());
  if (!reachable) {
    add("unreachable", "No email address and no phone number on file for anyone in this household.");
  } else if (i.emailSuppressed) {
    add("unreachable", "Their email has bounced or been reported as spam, so nothing will reach them that way.");
  }

  if (i.marketingConsent === "refused") {
    add("no_marketing_consent", "They have refused marketing email.");
  } else if (i.marketingConsent === "unknown") {
    add("no_marketing_consent", "No marketing consent recorded, so they can't go in a campaign.");
  }

  // ─── History ────────────────────────────────────────────────────────────
  if ((i.household.trips_count ?? 0) === 0) {
    add("never_travelled", "On the books, but has never travelled with you.");
  }

  if (i.hasLiveQuote) {
    add("open_quote", "A quote is with them and hasn't been answered.");
  }

  const hasFutureTrip = upcoming.length > 0 || Boolean(travelling);

  if (!hasFutureTrip && i.lastContactAt) {
    const months = monthsBetween(i.lastContactAt, i.now);
    if (months >= 6) {
      add(
        "gone_quiet",
        `Nothing either way since ${fmt(i.lastContactAt)} — ${months} months — and nothing booked.`
      );
    }
  }

  // The rebooking window: back long enough to be thinking about the next one,
  // not so long ago that they have quietly gone elsewhere.
  const lastBooking = i.household.last_booking_at;
  if (!hasFutureTrip && lastBooking) {
    const months = monthsBetween(lastBooking, i.now);
    if (months >= 9 && months <= 15) {
      add(
        "rebooking_window",
        `Last booked ${months} months ago and nothing since — about when they usually think about the next one.`
      );
    }
  }

  return out;
}

export const hasAttribute = (attrs: DerivedAttribute[], id: AttributeId): boolean =>
  attrs.some((a) => a.id === id);

/** The line above a filtered list: what was asked for, and what came back. */
export function describeFilter(id: AttributeId, count: number): string {
  const def = findAttribute(id);
  if (!def) return `${count} customers`;
  if (count === 0) return `Nobody is ${def.label.toLowerCase()} right now. ${def.description}`;
  return `${count} customer${count === 1 ? "" : "s"} · ${def.description}`;
}
