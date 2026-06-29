/**
 * Luna next steps — the deterministic "what should I do for this customer now"
 * list shown on the customer 360. Pure and data-driven: every step is derived
 * from real rows (an unanswered message, a soon-departing trip, a passport
 * flag, a long silence), so the panel reflects the actual record rather than a
 * hand-written demo script. Each step carries the action its "Do" button fires.
 */

import type { Contact, Trip, Interaction, Household } from "@/lib/supabase/types";
import { computeRisk } from "@/lib/scoring/customer";
import { daysUntil } from "@/lib/trips/presentation";

export type NextStep =
  | { kind: "reply"; text: string; interactionId: string }
  | {
      kind: "task";
      text: string;
      taskKind: "confirm_trip" | "flag_passport" | "check_in";
      title: string;
      reason: string;
      tripId?: string | null;
    }
  | { kind: "info"; text: string };

const MAX_STEPS = 4;
const INBOUND_KINDS = new Set(["email_in", "chat", "enquiry"]);
const CONFIRM_WINDOW_DAYS = 21;
const QUIET_DAYS = 120;

function firstName(displayName: string): string {
  return displayName.split(/\s|&/)[0]?.trim() || "this customer";
}

function daysSinceIso(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.floor((Date.now() - t) / 86400000);
}

export function computeNextSteps(
  household: Household,
  contacts: Contact[],
  trips: Trip[],
  interactions: Interaction[]
): NextStep[] {
  const steps: NextStep[] = [];
  const who = firstName(household.display_name);

  // 1. Reply — the most recent inbound message that hasn't been triaged away.
  const latestInbound = interactions
    .filter((ix) => ix.direction === "inbound" && INBOUND_KINDS.has(ix.kind))
    .sort((a, b) => (a.occurred_at < b.occurred_at ? 1 : -1))[0];
  if (latestInbound) {
    steps.push({
      kind: "reply",
      text: `Reply to ${who}'s ${latestInbound.channel === "email" ? "email" : "message"}${
        latestInbound.subject ? ` about "${latestInbound.subject}"` : ""
      }.`,
      interactionId: latestInbound.id,
    });
  }

  // 2. Confirm trip — nearest booked/pre-departure trip inside the window.
  const upcoming = trips
    .filter((t) => t.stage === "booked" || t.stage === "pre_departure")
    .map((t) => ({ t, d: daysUntil(t.depart_date) }))
    .filter((x) => x.d != null && x.d >= 0 && x.d <= CONFIRM_WINDOW_DAYS)
    .sort((a, b) => (a.d as number) - (b.d as number))[0];
  if (upcoming) {
    const d = upcoming.d as number;
    const dest = upcoming.t.destination ?? "their trip";
    steps.push({
      kind: "task",
      text: `Confirm final details for ${dest} — departs in ${d} ${d === 1 ? "day" : "days"}.`,
      taskKind: "confirm_trip",
      title: `Confirm details for ${dest}`,
      reason: `${dest} departs in ${d} ${d === 1 ? "day" : "days"}`,
      tripId: upcoming.t.id,
    });
  }

  // 3. Flag passport — when scoring surfaces a real passport issue.
  const risk = computeRisk(contacts, trips);
  const passportFlag = risk.flags.find((f) => /passport/i.test(f));
  if (passportFlag) {
    steps.push({
      kind: "task",
      text: `Flag a passport issue before the next booking: ${passportFlag}.`,
      taskKind: "flag_passport",
      title: "Flag passport with customer",
      reason: passportFlag,
    });
  }

  // 4. Check in — an established customer who has gone quiet.
  const isCustomer = (household.trips_count ?? 0) > 0 || Boolean(household.customer_since);
  const lastTouch = interactions
    .map((ix) => ix.occurred_at)
    .sort()
    .slice(-1)[0];
  const quietDays = daysSinceIso(lastTouch ?? household.last_booking_at);
  if (isCustomer && quietDays != null && quietDays >= QUIET_DAYS) {
    const months = Math.round(quietDays / 30);
    steps.push({
      kind: "task",
      text: `Send ${who} a check-in — no contact in about ${months} months.`,
      taskKind: "check_in",
      title: `Check in with ${household.display_name}`,
      reason: `No contact in about ${months} months`,
    });
  }

  if (steps.length === 0) {
    steps.push({
      kind: "info",
      text: "No actions needed right now. Passports, trips and recent contact all look clear.",
    });
  }

  return steps.slice(0, MAX_STEPS);
}
