/**
 * Travel Memory — the blueprint's signature feature (§5): a readable,
 * persistent understanding of how each customer travels, where EVERY line
 * cites where it came from.
 *
 * Assembly is deterministic: each fact is derived from real rows (trips,
 * preferences, contacts, quotes) with plain arithmetic, and carries its
 * citation. Luna's prose brief may draw on the same rows; this panel is the
 * evidence table under it. If a fact can't be computed honestly, it simply
 * isn't shown — no filler, no guesses.
 *
 * Pure functions, no I/O.
 */

import type { Contact, Household, Quote, Trip } from "@/lib/supabase/types";

export type MemoryCategory =
  | "places"
  | "money"
  | "rhythm"
  | "party"
  | "tastes"
  | "watchouts";

export type MemoryFact = {
  category: MemoryCategory;
  text: string;
  /** The citation: which rows produced this fact. */
  source: string;
};

export type MemoryPreference = {
  category: string;
  value: string;
  source?: string | null; // 'manual' | 'inferred' | 'survey'
  confidence?: number | null;
};

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const money = (n: number): string => `£${Math.round(n).toLocaleString("en-GB")}`;

const listWithCounts = (values: string[]): string => {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([v, n]) => (n > 1 ? `${v} (×${n})` : v))
    .join(", ");
};

export function computeTravelMemory(args: {
  household: Household;
  contacts: Contact[];
  trips: Trip[];
  preferences: MemoryPreference[];
  quotes: Quote[];
  now?: Date;
}): MemoryFact[] {
  const { household, contacts, trips, preferences, quotes } = args;
  const now = args.now ?? new Date();
  const facts: MemoryFact[] = [];

  const completed = trips.filter((t) => t.stage === "returned");
  const real = trips.filter((t) => t.stage !== "enquiry" && t.stage !== "quoted" && t.stage !== "cancelled");

  // ─── Places ─────────────────────────────────────────────────────────
  if (completed.length > 0) {
    const places = completed.map((t) => t.destination).filter((d): d is string => Boolean(d));
    if (places.length > 0) {
      facts.push({
        category: "places",
        text: `Has travelled to ${listWithCounts(places)}.`,
        source: `${completed.length} completed trip${completed.length === 1 ? "" : "s"} on record`,
      });
    }

    const countries = completed
      .map((t) => t.destination_country)
      .filter((c): c is string => Boolean(c));
    const repeatCountry = [...new Map(
      countries.map((c) => [c, countries.filter((x) => x === c).length])
    ).entries()].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1])[0];
    if (repeatCountry) {
      facts.push({
        category: "places",
        text: `Returns to ${repeatCountry[0]} — ${repeatCountry[1]} trips there.`,
        source: "repeat destination in trip history",
      });
    }
  }

  // ─── Money ──────────────────────────────────────────────────────────
  const valued = real.filter((t) => (t.total_value ?? 0) > 0);
  if (valued.length >= 2) {
    const avg = valued.reduce((s, t) => s + (t.total_value ?? 0), 0) / valued.length;
    const top = Math.max(...valued.map((t) => t.total_value ?? 0));
    facts.push({
      category: "money",
      text: `Typically spends around ${money(avg)} a trip (biggest booking ${money(top)}).`,
      source: `average of ${valued.length} priced bookings`,
    });
  }

  // ─── Rhythm ─────────────────────────────────────────────────────────
  const dated = real
    .filter((t) => t.depart_date)
    .sort((a, b) => new Date(a.depart_date!).getTime() - new Date(b.depart_date!).getTime());

  if (dated.length >= 3) {
    const gaps: number[] = [];
    for (let i = 1; i < dated.length; i++) {
      gaps.push(
        (new Date(dated[i].depart_date!).getTime() - new Date(dated[i - 1].depart_date!).getTime()) /
          (1000 * 60 * 60 * 24 * 30)
      );
    }
    const avgGap = Math.round(gaps.reduce((s, g) => s + g, 0) / gaps.length);
    if (avgGap >= 1) {
      facts.push({
        category: "rhythm",
        text: `Books roughly every ${avgGap} month${avgGap === 1 ? "" : "s"}.`,
        source: `departure dates of ${dated.length} bookings`,
      });
    }
  }

  if (dated.length >= 2) {
    const monthCounts = new Map<number, number>();
    for (const t of dated) {
      const m = new Date(t.depart_date!).getMonth();
      monthCounts.set(m, (monthCounts.get(m) ?? 0) + 1);
    }
    const favoured = [...monthCounts.entries()].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]);
    if (favoured.length > 0) {
      facts.push({
        category: "rhythm",
        text: `Usually travels in ${favoured.slice(0, 2).map(([m]) => MONTHS[m]).join(" and ")}.`,
        source: "departure months across trip history",
      });
    }
  }

  const withNights = real.filter((t) => (t.duration_nights ?? 0) > 0);
  if (withNights.length >= 2) {
    const avgNights = Math.round(
      withNights.reduce((s, t) => s + (t.duration_nights ?? 0), 0) / withNights.length
    );
    facts.push({
      category: "rhythm",
      text: `Typical trip length is ${avgNights} night${avgNights === 1 ? "" : "s"}.`,
      source: `${withNights.length} trips with a recorded duration`,
    });
  }

  // ─── Party ──────────────────────────────────────────────────────────
  if (contacts.length > 0) {
    const children = contacts.filter((c) => c.role === "child");
    const adults = contacts.length - children.length;
    const ages = children
      .map((c) => (c.date_of_birth ? ageAt(c.date_of_birth, now) : null))
      .filter((a): a is number => a != null);
    const agesBit = ages.length > 0 ? ` (children ${ages.join(", ")})` : "";
    facts.push({
      category: "party",
      text:
        children.length > 0
          ? `Travels as ${adults} adult${adults === 1 ? "" : "s"} and ${children.length} child${children.length === 1 ? "" : "ren"}${agesBit}.`
          : contacts.length === 1
            ? "Travels solo."
            : `Travels as ${contacts.length} adults.`,
      source: "household record",
    });
  }

  const occasions = trips
    .filter((t) => t.occasion && t.stage !== "cancelled")
    .map((t) => {
      const year = t.depart_date ? ` ${new Date(t.depart_date).getFullYear()}` : "";
      return `${t.occasion} (${t.destination ?? "trip"}${year})`;
    });
  if (occasions.length > 0) {
    facts.push({
      category: "party",
      text: `Marks occasions with travel: ${occasions.slice(0, 3).join("; ")}.`,
      source: "occasions recorded on trips",
    });
  }

  // ─── Tastes — recorded and inferred preferences, provenance shown ───
  for (const p of preferences.slice(0, 6)) {
    const provenance =
      p.source === "inferred"
        ? `inferred by Luna${p.confidence != null ? ` (${Math.round(p.confidence * 100)}% confidence)` : ""}`
        : p.source === "survey"
          ? "from a survey response"
          : "recorded preference";
    facts.push({
      category: "tastes",
      text: `${p.category}: ${p.value}.`,
      source: provenance,
    });
  }

  // ─── Watch-outs ─────────────────────────────────────────────────────
  for (const c of contacts) {
    if (c.dietary) {
      facts.push({
        category: "watchouts",
        text: `${c.first_name}: ${c.dietary}.`,
        source: "traveller record",
      });
    }
    for (const flag of c.flags ?? []) {
      facts.push({
        category: "watchouts",
        text: `${c.first_name}: ${flag}.`,
        source: "flag on traveller record",
      });
    }
  }

  const declined = quotes
    .filter((q) => q.status === "declined" && q.declined_reason)
    .sort((a, b) => (b.updated_at ?? "").localeCompare(a.updated_at ?? ""));
  if (declined.length > 0) {
    const q = declined[0];
    const when = q.updated_at
      ? ` (${new Date(q.updated_at).toLocaleDateString("en-GB", { month: "short", year: "numeric" })})`
      : "";
    facts.push({
      category: "watchouts",
      text: `Last declined quote: "${q.declined_reason}"${when}.`,
      source: `quote v${q.version}${q.total_price != null ? ` at ${money(q.total_price)}` : ""}`,
    });
  }

  if ((household.notes ?? "").trim()) {
    facts.push({
      category: "watchouts",
      text: household.notes!.trim().slice(0, 200),
      source: "household notes",
    });
  }

  return facts;
}

function ageAt(dobIso: string, now: Date): number {
  const dob = new Date(dobIso);
  let age = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age--;
  return age;
}
