/**
 * Birthday arithmetic — the pure bit behind Luna's "whose birthday is coming
 * up?" answer. Date-of-birth is a real column on contacts, so this is exact:
 * days until the next anniversary of the birth date, and the age they'll turn.
 */

function parseDob(dob: string): Date | null {
  const t = Date.parse(dob.length <= 10 ? `${dob}T00:00:00Z` : dob);
  return Number.isNaN(t) ? null : new Date(t);
}

/** Days until the next birthday (0 = today). Feb 29 falls to Mar 1 off-leap. */
export function daysUntilBirthday(dob: string, now: Date): number | null {
  const d = parseDob(dob);
  if (!d) return null;
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  let next = Date.UTC(now.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  if (next < today) next = Date.UTC(now.getUTCFullYear() + 1, d.getUTCMonth(), d.getUTCDate());
  return Math.round((next - today) / 86_400_000);
}

/** The age they turn on that next birthday, or null if the year is unknown. */
export function ageTurning(dob: string, now: Date): number | null {
  const d = parseDob(dob);
  if (!d) return null;
  const days = daysUntilBirthday(dob, now);
  if (days == null) return null;
  const birthdayYear = days === 0 ? now.getUTCFullYear() : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) + days * 86_400_000).getUTCFullYear();
  return birthdayYear - d.getUTCFullYear();
}
