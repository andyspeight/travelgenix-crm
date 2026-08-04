/**
 * Travel-aware case priority — blueprint differentiator 5.
 *
 * "A case involving a customer currently stranded overseas must
 * automatically outrank a routine post-trip question."
 *
 * Deterministic, like every scoring module in this codebase: the priority
 * is computed from the case type and the REAL travel context, and the
 * reason lists exactly which rules fired. No AI in the maths.
 *
 * Priority scale: 1 = act now, 2 = act today, 3 = this week, 4 = routine.
 * Each carries an SLA resolution target; the /service queue counts down
 * against it with the same clock the enquiries screen uses.
 *
 * Pure functions, no I/O.
 */

import type { Contact, Trip, CaseStatus } from "@/lib/supabase/types";

export const CASE_TYPES = [
  "general_enquiry",
  "amendment",
  "cancellation",
  "refund",
  "complaint",
  "documentation",
  "payment",
  "supplier_issue",
  "flight_disruption",
  "accommodation_issue",
  "in_destination_emergency",
  "insurance",
  "post_trip_complaint",
] as const;

export type CaseType = (typeof CASE_TYPES)[number];

export const CASE_TYPE_LABELS: Record<CaseType, string> = {
  general_enquiry: "General enquiry",
  amendment: "Amendment",
  cancellation: "Cancellation",
  refund: "Refund",
  complaint: "Complaint",
  documentation: "Documentation",
  payment: "Payment problem",
  supplier_issue: "Supplier issue",
  flight_disruption: "Flight disruption",
  accommodation_issue: "Accommodation issue",
  in_destination_emergency: "In-destination emergency",
  insurance: "Insurance",
  post_trip_complaint: "Post-trip complaint",
};

/** Base urgency per case type: 1 most urgent … 4 routine. */
const BASE_PRIORITY: Record<CaseType, 1 | 2 | 3 | 4> = {
  in_destination_emergency: 1,
  flight_disruption: 1,
  accommodation_issue: 2,
  payment: 2,
  cancellation: 2,
  complaint: 3,
  refund: 3,
  amendment: 3,
  supplier_issue: 3,
  documentation: 3,
  insurance: 3,
  general_enquiry: 4,
  post_trip_complaint: 4,
};

/**
 * How a priority reads as a badge — one definition, shared by the /service
 * queue and the case panel on a customer's 360 so a P1 looks identical in both.
 */
export const PRIORITY_META: Record<1 | 2 | 3 | 4, { label: string; bg: string; fg: string }> = {
  1: { label: "P1 · act now", bg: "rgba(220, 38, 38, 0.12)", fg: "#dc2626" },
  2: { label: "P2 · today", bg: "rgba(217, 119, 6, 0.12)", fg: "#d97706" },
  3: { label: "P3 · this week", bg: "rgba(0, 180, 216, 0.12)", fg: "var(--tg-accent-dark)" },
  4: { label: "P4 · routine", bg: "var(--bg-subtle)", fg: "var(--text-muted)" },
};

/** Human labels for each case status. */
export const CASE_STATUS_LABELS: Record<CaseStatus, string> = {
  open: "Open",
  in_progress: "In progress",
  waiting: "Waiting",
  resolved: "Resolved",
  closed: "Closed",
};

/** Open in the sense that matters to a customer: still needs work. Resolved
 *  and closed are done; everything else is live. */
export function isCaseOpen(status: string): boolean {
  return status !== "resolved" && status !== "closed";
}

/** SLA resolution targets in hours, by priority. */
export const SLA_HOURS: Record<1 | 2 | 3 | 4, number> = {
  1: 2,
  2: 8,
  3: 24,
  4: 72,
};

export type CasePriority = {
  priority: 1 | 2 | 3 | 4;
  reason: string;
  slaHours: number;
};

export type CaseTravelContext = {
  trip: Pick<Trip, "stage" | "depart_date" | "destination" | "total_value"> | null;
  contacts: Pick<Contact, "role" | "flags">[];
};

const DAY_MS = 86_400_000;

export function computeCasePriority(
  caseType: CaseType,
  ctx: CaseTravelContext,
  nowIso: string = new Date().toISOString()
): CasePriority {
  const rules: string[] = [];
  let priority: number = BASE_PRIORITY[caseType];
  rules.push(`${CASE_TYPE_LABELS[caseType].toLowerCase()} starts at P${priority}`);

  const trip = ctx.trip;
  const travellingNow = trip?.stage === "travelling";
  const departDays =
    trip?.depart_date != null
      ? Math.floor((new Date(trip.depart_date).getTime() - new Date(nowIso).getTime()) / DAY_MS)
      : null;

  // The rule the blueprint names: in destination beats everything routine.
  if (travellingNow) {
    priority = 1;
    rules.push("the customer is travelling right now");
  } else if (departDays != null && departDays >= 0 && departDays <= 7) {
    priority = Math.min(priority, 2);
    rules.push(`departure is ${departDays === 0 ? "today" : `in ${departDays} day${departDays === 1 ? "" : "s"}`}`);
  } else if (departDays != null && departDays > 7 && departDays <= 21) {
    priority = Math.max(1, priority - 1);
    rules.push(`departure is in ${departDays} days`);
  }

  // People amplifiers: children in the party, vulnerable-traveller flags.
  const children = ctx.contacts.filter((c) => c.role === "child").length;
  if (children > 0 && priority > 1 && (travellingNow || (departDays != null && departDays <= 21))) {
    priority -= 1;
    rules.push(`${children} child${children === 1 ? "" : "ren"} in the party`);
  }

  const vulnerable = ctx.contacts.flatMap((c) => c.flags ?? []).filter((f) =>
    /mobility|assistance|medical|unaccompanied|vulnerab/i.test(f)
  );
  if (vulnerable.length > 0 && priority > 1) {
    priority -= 1;
    rules.push(`vulnerable-traveller flag on file (${vulnerable[0]})`);
  }

  // Money amplifier: a big booking at stake raises the stakes one notch.
  if ((trip?.total_value ?? 0) >= 8000 && priority > 2) {
    priority -= 1;
    rules.push(`£${Math.round(trip!.total_value!).toLocaleString("en-GB")} booking at stake`);
  }

  const finalPriority = Math.max(1, Math.min(4, priority)) as 1 | 2 | 3 | 4;

  return {
    priority: finalPriority,
    reason: `P${finalPriority}: ${rules.join("; ")}.`,
    slaHours: SLA_HOURS[finalPriority],
  };
}

/** SLA due timestamp for a case opened now. */
export function slaDueAt(openedAtIso: string, slaHours: number): string {
  return new Date(new Date(openedAtIso).getTime() + slaHours * 3600_000).toISOString();
}
