/**
 * Conversation openers for the 360 — the small, human facts an agent can lead a
 * call with: how their last trip went, and what's coming up. Pure and tested;
 * the panel adds live destination weather on top.
 */

export type TripLite = {
  destination: string | null;
  destination_country?: string | null;
  depart_date: string | null;
  return_date: string | null;
};

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
