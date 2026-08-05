/**
 * Conversation openers for the 360 — the small, human facts an agent can lead a
 * call with: how their last trip went, and what's coming up. Pure and tested;
 * the panel adds live destination weather on top.
 */

import { daysUntilBirthday, ageTurning } from "@/lib/contacts/birthdays";

export type TripLite = {
  destination: string | null;
  destination_country?: string | null;
  depart_date: string | null;
  return_date: string | null;
};

export type ContactLite = { first_name: string; date_of_birth: string | null };
export type HouseholdLite = { customer_since: string | null; trips_count: number };

/** A ready-to-show opener line: an emoji and a sentence. */
export type Opener = { emoji: string; text: string };

const DAY = 86_400_000;

/** "today" / "yesterday" / "3 weeks ago" / "in 6 weeks" for a date vs now. */
export function relativePhrase(iso: string, now: Date): string {
  const days = Math.round((new Date(iso).getTime() - now.getTime()) / DAY);
  const past = days < 0;
  const n = Math.abs(days);

  if (n === 0) return "today";
  if (n === 1) return past ? "yesterday" : "tomorrow";

  let val: number;
  let unit: string;
  if (n < 14) {
    val = n;
    unit = "days";
  } else if (n < 60) {
    val = Math.round(n / 7);
    unit = "weeks";
  } else if (n < 365) {
    val = Math.round(n / 30);
    unit = val === 1 ? "month" : "months";
  } else {
    val = Math.round(n / 365);
    unit = val === 1 ? "year" : "years";
  }
  return past ? `${val} ${unit} ago` : `in ${val} ${unit}`;
}

const place = (t: TripLite): string | null => t.destination ?? t.destination_country ?? null;

/** The most recent returned trip, as a "Back from X, N weeks ago" opener. */
export function lastTripSummary(
  pastTrips: TripLite[],
  now: Date
): { destination: string; phrase: string } | null {
  const dated = pastTrips
    .map((t) => ({ t, when: t.return_date ?? t.depart_date }))
    .filter((x): x is { t: TripLite; when: string } => Boolean(x.when));
  if (dated.length === 0) return null;
  dated.sort((a, b) => (a.when < b.when ? 1 : -1)); // most recent first
  const top = dated[0];
  const dest = place(top.t);
  if (!dest) return null;
  return { destination: dest, phrase: relativePhrase(top.when, now) };
}

/**
 * The trip to talk about next: the one they're on now if any, else the soonest
 * upcoming. Carries the destination (for a weather lookup) and a when-phrase.
 */
export function nextTripSummary(
  activeTrip: TripLite | null,
  upcomingTrips: TripLite[],
  now: Date
): { destination: string; active: boolean; phrase: string | null } | null {
  const soonest = [...upcomingTrips]
    .filter((t) => t.depart_date)
    .sort((a, b) => (a.depart_date! < b.depart_date! ? -1 : 1))[0];
  const pick = activeTrip ?? soonest ?? null;
  if (!pick) return null;
  const dest = place(pick);
  if (!dest) return null;
  return {
    destination: dest,
    active: Boolean(activeTrip),
    phrase: activeTrip ? "there now" : pick.depart_date ? `departs ${relativePhrase(pick.depart_date, now)}` : null,
  };
}

/** An upcoming birthday within the next month — a warm, timely opener. */
export function birthdayOpener(contacts: ContactLite[], now: Date): Opener | null {
  let best: { name: string; days: number; age: number | null } | null = null;
  for (const c of contacts) {
    if (!c.date_of_birth) continue;
    const days = daysUntilBirthday(c.date_of_birth, now);
    if (days == null || days > 30) continue; // only when it's coming up
    if (!best || days < best.days) {
      best = { name: c.first_name, days, age: ageTurning(c.date_of_birth, now) };
    }
  }
  if (!best) return null;
  const when =
    best.days === 0 ? "today" : best.days === 1 ? "tomorrow" : best.days < 14 ? `in ${best.days} days` : `in ${Math.round(best.days / 7)} weeks`;
  const age = best.age != null ? ` (turning ${best.age})` : "";
  return { emoji: "🎂", text: `${best.name}'s birthday ${when}${age}` };
}

/**
 * A past trip that departed around this time of year in an earlier year — the
 * "they travel this season, time for a nudge" opener.
 */
export function rebookingOpener(pastTrips: TripLite[], now: Date): Opener | null {
  const nowMonth = now.getUTCMonth();
  const nowYear = now.getUTCFullYear();
  let best: { dest: string; year: number } | null = null;
  for (const t of pastTrips) {
    if (!t.depart_date) continue;
    const d = new Date(t.depart_date);
    const monthDiff = Math.abs(d.getUTCMonth() - nowMonth);
    const seasonal = monthDiff <= 1 || monthDiff === 11; // within a month, wrapping Dec↔Jan
    if (!seasonal || d.getUTCFullYear() >= nowYear) continue;
    const dest = place(t);
    if (!dest) continue;
    if (!best || d.getUTCFullYear() > best.year) best = { dest, year: d.getUTCFullYear() };
  }
  if (!best) return null;
  const yrs = nowYear - best.year;
  const whenYr = yrs === 1 ? "this time last year" : `around now ${yrs} years ago`;
  return { emoji: "🔁", text: `${cap(whenYr)}: ${best.dest} — rebooking time?` };
}

/** A loyalty snapshot for a repeat customer. */
export function loyaltyOpener(h: HouseholdLite): Opener | null {
  if (h.trips_count < 2) return null; // one trip is already covered by "last trip"
  const year = h.customer_since ? new Date(h.customer_since).getUTCFullYear() : null;
  const text = year ? `With you since ${year} · ${h.trips_count} trips` : `${h.trips_count} trips with you`;
  return { emoji: "⭐", text };
}

const cap = (s: string): string => (s ? s[0].toUpperCase() + s.slice(1) : s);
