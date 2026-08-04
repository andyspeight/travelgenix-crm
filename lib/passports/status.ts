/**
 * Passport status across travellers — the pure scan behind Luna's
 * "any passport issues?" answer.
 *
 * Three kinds of issue, in the order that matters:
 *   1. EXPIRED — the passport is already out of date.
 *   2. INSUFFICIENT FOR A TRIP — there's an upcoming trip and the passport
 *      either expires before it or has under six months' validity beyond it
 *      (the rule most airlines and countries enforce).
 *   3. EXPIRING SOON — no trip booked, but the passport lapses within the
 *      margin window, so it's worth a nudge before they book.
 * Plus MISSING — no passport on file for someone with a trip coming up.
 *
 * Deterministic and testable: the same hard-fact discipline as the risk
 * scorer (lib/scoring/customer.ts), which this shares its six-month rule with.
 */

/** Most airlines/countries require six months' validity beyond travel. */
export const PASSPORT_MARGIN_DAYS = 183;

export type PassportIssueKind = "expired" | "insufficient_for_trip" | "expiring_soon" | "missing";

export type PassportIssue = {
  contactId: string;
  householdId: string;
  travellerName: string;
  kind: PassportIssueKind;
  detail: string;
  /** ISO date (YYYY-MM-DD) or null when none on file. */
  expiry: string | null;
  daysUntilExpiry: number | null;
  severity: "warning" | "info";
};

export type PassportContact = {
  id: string;
  household_id: string;
  first_name: string | null;
  last_name: string | null;
  passport_expiry: string | null;
};

export type PassportTrip = {
  household_id: string | null;
  destination: string | null;
  depart_date: string | null;
  stage: string | null;
};

function daysUntil(dateStr: string | null, now: Date): number | null {
  if (!dateStr) return null;
  const t = Date.parse(dateStr.length <= 10 ? `${dateStr}T00:00:00` : dateStr);
  if (Number.isNaN(t)) return null;
  return Math.floor((t - now.getTime()) / 86_400_000);
}

function fmtDate(dateStr: string): string {
  const t = Date.parse(dateStr.length <= 10 ? `${dateStr}T00:00:00` : dateStr);
  if (Number.isNaN(t)) return dateStr;
  return new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function fmtAway(days: number): string {
  if (days <= 0) return "today";
  if (days < 31) return `${days} day${days === 1 ? "" : "s"}`;
  const months = Math.round(days / 30.44);
  if (months < 12) return `${months} month${months === 1 ? "" : "s"}`;
  const years = Math.floor(months / 12);
  return `${years} year${years === 1 ? "" : "s"}`;
}

/**
 * Scan travellers for passport issues. `now` is injected for testability;
 * `marginMonths` overrides the six-month default.
 */
export function scanPassports(
  contacts: PassportContact[],
  trips: PassportTrip[],
  now: Date,
  opts: { marginMonths?: number } = {}
): PassportIssue[] {
  const marginDays = opts.marginMonths ? Math.round(opts.marginMonths * 30.44) : PASSPORT_MARGIN_DAYS;

  // Soonest upcoming (future, live) trip per household.
  const upcoming = new Map<string, { destination: string | null; departDays: number }>();
  for (const t of trips) {
    if (!t.household_id || t.stage === "cancelled" || t.stage === "returned") continue;
    const d = daysUntil(t.depart_date, now);
    if (d == null || d < 0) continue;
    const cur = upcoming.get(t.household_id);
    if (!cur || d < cur.departDays) upcoming.set(t.household_id, { destination: t.destination ?? null, departDays: d });
  }

  const issues: PassportIssue[] = [];

  for (const c of contacts) {
    const trip = upcoming.get(c.household_id) ?? null;
    const travellerName = [c.first_name, c.last_name].filter(Boolean).join(" ") || c.first_name || "A traveller";
    const base = { contactId: c.id, householdId: c.household_id, travellerName };

    if (!c.passport_expiry) {
      if (trip) {
        issues.push({
          ...base,
          kind: "missing",
          severity: "warning",
          detail: `No passport on file — ${trip.destination ?? "a trip"} departs in ${fmtAway(trip.departDays)}`,
          expiry: null,
          daysUntilExpiry: null,
        });
      }
      continue;
    }

    const expiryDays = daysUntil(c.passport_expiry, now);
    if (expiryDays == null) continue;
    const expiry = c.passport_expiry;

    if (expiryDays < 0) {
      issues.push({
        ...base,
        kind: "expired",
        severity: "warning",
        detail: `Passport expired ${fmtDate(expiry)}`,
        expiry,
        daysUntilExpiry: expiryDays,
      });
      continue;
    }

    if (trip) {
      const margin = expiryDays - trip.departDays;
      if (margin < 0) {
        issues.push({
          ...base,
          kind: "insufficient_for_trip",
          severity: "warning",
          detail: `Passport expires before ${trip.destination ?? "their trip"} (${fmtDate(expiry)})`,
          expiry,
          daysUntilExpiry: expiryDays,
        });
        continue;
      }
      if (margin < marginDays) {
        issues.push({
          ...base,
          kind: "insufficient_for_trip",
          severity: "warning",
          detail: `Under 6 months' validity for ${trip.destination ?? "their trip"} — expires ${fmtDate(expiry)}`,
          expiry,
          daysUntilExpiry: expiryDays,
        });
        continue;
      }
    }

    if (expiryDays < marginDays) {
      issues.push({
        ...base,
        kind: "expiring_soon",
        severity: expiryDays < 90 ? "warning" : "info",
        detail: `Passport expires in ${fmtAway(expiryDays)} (${fmtDate(expiry)})`,
        expiry,
        daysUntilExpiry: expiryDays,
      });
    }
  }

  // Warnings first, then soonest to expire (missing/expired float to the top).
  const sev = (i: PassportIssue) => (i.severity === "warning" ? 0 : 1);
  return issues.sort(
    (a, b) => sev(a) - sev(b) || (a.daysUntilExpiry ?? 0) - (b.daysUntilExpiry ?? 0)
  );
}

/** A one-line, deterministic summary of a scan for the Luna insight layer. */
export function summarisePassports(issues: PassportIssue[]): string {
  if (issues.length === 0) return "No passport issues found.";
  const counts: Record<PassportIssueKind, number> = {
    expired: 0,
    insufficient_for_trip: 0,
    expiring_soon: 0,
    missing: 0,
  };
  for (const i of issues) counts[i.kind]++;
  const parts: string[] = [];
  if (counts.expired) parts.push(`${counts.expired} expired`);
  if (counts.insufficient_for_trip) parts.push(`${counts.insufficient_for_trip} short of validity for a trip`);
  if (counts.expiring_soon) parts.push(`${counts.expiring_soon} expiring soon`);
  if (counts.missing) parts.push(`${counts.missing} with no passport on file`);
  const n = issues.length;
  return `${n} traveller${n === 1 ? "" : "s"} with passport issues: ${parts.join(", ")}.`;
}

export const PASSPORT_KIND_LABEL: Record<PassportIssueKind, string> = {
  expired: "Expired",
  insufficient_for_trip: "Short for trip",
  expiring_soon: "Expiring soon",
  missing: "No passport",
};
