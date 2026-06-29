/**
 * Journeys engine — the deterministic core of Luna's auto-pilot.
 *
 * A journey is a rule: a trigger (when) plus an action (what Luna does). This
 * module owns three things and nothing else:
 *   1. The shape of a journey and its run log.
 *   2. The starter journeys we install for a fresh workspace.
 *   3. The matcher: given a journey and the current agency data, which
 *      households or trips are eligible right now, and why.
 *
 * The matcher is pure and side-effect free, so the journeys page can preview
 * "X eligible now" without writing anything, and the run endpoint can reuse the
 * exact same logic to decide what to act on. No AI is needed to MATCH, only to
 * draft, so matching stays fast, free and testable.
 */

import type { Household, Trip, Contact } from "@/lib/supabase/types";

// ─── Types ──────────────────────────────────────────────────────────────────

export type JourneyTrigger =
  | "days_to_departure"
  | "days_after_return"
  | "birthday"
  | "anniversary"
  | "passport_expiring"
  | "no_contact_period"
  | "custom";

export type JourneyAction = "draft_email" | "create_task" | "add_note";

export type Journey = {
  id: string;
  agency_id: string;
  name: string;
  description: string | null;
  trigger_kind: JourneyTrigger;
  trigger_config: Record<string, unknown>;
  action_kind: string;
  action_config: Record<string, unknown>;
  is_active: boolean;
  last_run_at: string | null;
  created_at: string;
  updated_at: string;
};

export type JourneyRun = {
  id: string;
  journey_id: string;
  household_id: string | null;
  trip_id: string | null;
  status: string;
  result: Record<string, unknown>;
  fired_at: string;
  resolved_at: string | null;
};

/** A starter journey, before it has a database id. */
export type JourneyDef = {
  name: string;
  description: string;
  trigger_kind: JourneyTrigger;
  trigger_config: Record<string, number>;
  action_kind: JourneyAction;
  action_config: Record<string, unknown>;
};

/** One eligible target produced by the matcher. */
export type Candidate = {
  household_id: string | null;
  trip_id: string | null;
  reason: string;
  /** Optional context the action builder can use (a name, a destination). */
  subject?: string | null;
  destination?: string | null;
};

// ─── Starter journeys ───────────────────────────────────────────────────────
// Four rules that map cleanly onto data we actually hold. Each one is the kind
// of follow-up a busy agent forgets, which is exactly what auto-pilot is for.

export const DEFAULT_JOURNEYS: JourneyDef[] = [
  {
    name: "Pre-departure check-in",
    description:
      "Ten days before a trip departs, create a task to confirm final details and check passports.",
    trigger_kind: "days_to_departure",
    trigger_config: { days: 10 },
    action_kind: "create_task",
    action_config: { title: "Confirm final details before departure" },
  },
  {
    name: "Welcome home",
    description:
      "Three days after a customer returns, draft a warm welcome-home email and ask how the trip went.",
    trigger_kind: "days_after_return",
    trigger_config: { days: 3 },
    action_kind: "draft_email",
    action_config: { tone: "warm" },
  },
  {
    name: "Passport expiry warning",
    description:
      "When a traveller's passport is within six months of expiry, create a task to flag it before they book again.",
    trigger_kind: "passport_expiring",
    trigger_config: { days: 180 },
    action_kind: "create_task",
    action_config: { title: "Passport expiring soon, flag with customer" },
  },
  {
    name: "Re-engage quiet customers",
    description:
      "When a past customer has had no contact for twelve months, draft a re-engagement email with a fresh idea.",
    trigger_kind: "no_contact_period",
    trigger_config: { months: 12 },
    action_kind: "draft_email",
    action_config: { tone: "light" },
  },
];

// ─── Human-readable descriptors ─────────────────────────────────────────────

export const ACTION_LABELS: Record<string, string> = {
  draft_email: "Draft email",
  create_task: "Create task",
  add_note: "Add note",
};

export function describeTrigger(j: Pick<Journey, "trigger_kind" | "trigger_config">): string {
  const c = j.trigger_config ?? {};
  const days = Number(c.days);
  const months = Number(c.months);
  switch (j.trigger_kind) {
    case "days_to_departure":
      return `${days || 0} days before departure`;
    case "days_after_return":
      return `${days || 0} days after return`;
    case "passport_expiring":
      return `Passport within ${days || 0} days of expiry`;
    case "no_contact_period":
      return `No contact for ${months || 0} months`;
    case "birthday":
      return "On a traveller's birthday";
    case "anniversary":
      return "On a trip anniversary";
    default:
      return "Custom rule";
  }
}

export function describeAction(j: Pick<Journey, "action_kind">): string {
  return ACTION_LABELS[j.action_kind] ?? j.action_kind;
}

// ─── Date helpers (pure, relative to a passed-in "now") ─────────────────────

function daysUntil(dateStr: string | null | undefined, now: Date): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  const a = new Date(now);
  a.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - a.getTime()) / 86400000);
}

function daysSince(dateStr: string | null | undefined, now: Date): number | null {
  const d = daysUntil(dateStr, now);
  return d == null ? null : -d;
}

// ─── Eval context ───────────────────────────────────────────────────────────

export type EvalContext = {
  now: Date;
  households: Household[];
  trips: Trip[];
  contacts: Contact[];
  /** household_id -> ISO timestamp of the most recent interaction. */
  lastContactByHousehold: Map<string, string>;
};

/** Build the last-contact map from a list of (household_id, occurred_at) rows. */
export function buildLastContactMap(
  rows: { household_id: string | null; occurred_at: string }[]
): Map<string, string> {
  const map = new Map<string, string>();
  for (const r of rows) {
    if (!r.household_id) continue;
    const existing = map.get(r.household_id);
    if (!existing || r.occurred_at > existing) map.set(r.household_id, r.occurred_at);
  }
  return map;
}

// ─── The matcher ────────────────────────────────────────────────────────────

const MAX_CANDIDATES = 50; // a single run never fires on more than this

export function evaluateJourney(journey: Journey, ctx: EvalContext): Candidate[] {
  const { now } = ctx;
  const cfg = journey.trigger_config ?? {};
  const out: Candidate[] = [];

  switch (journey.trigger_kind) {
    case "days_to_departure": {
      const N = Number(cfg.days) || 10;
      for (const t of ctx.trips) {
        if (t.stage !== "booked" && t.stage !== "pre_departure") continue;
        const d = daysUntil(t.depart_date, now);
        if (d == null || d < 0 || d > N) continue;
        out.push({
          household_id: t.household_id,
          trip_id: t.id,
          destination: t.destination,
          reason: `${t.destination ?? "Trip"} departs in ${d} ${d === 1 ? "day" : "days"}`,
        });
      }
      break;
    }

    case "days_after_return": {
      const N = Number(cfg.days) || 3;
      for (const t of ctx.trips) {
        if (t.stage !== "returned") continue;
        const s = daysSince(t.return_date, now);
        if (s == null || s < 0 || s > Math.max(N, N + 4)) continue;
        out.push({
          household_id: t.household_id,
          trip_id: t.id,
          destination: t.destination,
          reason: `Returned from ${t.destination ?? "their trip"} ${s} ${s === 1 ? "day" : "days"} ago`,
        });
      }
      break;
    }

    case "passport_expiring": {
      const N = Number(cfg.days) || 180;
      for (const c of ctx.contacts) {
        const d = daysUntil(c.passport_expiry, now);
        if (d == null || d > N) continue; // include already-expired (d negative)
        const who = [c.first_name, c.last_name].filter(Boolean).join(" ") || "A traveller";
        out.push({
          household_id: c.household_id,
          trip_id: null,
          subject: who,
          reason:
            d < 0
              ? `${who}'s passport expired ${-d} ${-d === 1 ? "day" : "days"} ago`
              : `${who}'s passport expires in ${d} ${d === 1 ? "day" : "days"}`,
        });
      }
      break;
    }

    case "no_contact_period": {
      const months = Number(cfg.months) || 12;
      const threshold = months * 30;
      for (const h of ctx.households) {
        // Only past customers can go quiet. Skip households with no history.
        const isCustomer = (h.trips_count ?? 0) > 0 || Boolean(h.customer_since);
        if (!isCustomer) continue;
        const last =
          ctx.lastContactByHousehold.get(h.id) ?? h.last_booking_at ?? h.customer_since;
        const s = daysSince(last, now);
        if (s == null || s < threshold) continue;
        const m = Math.round(s / 30);
        out.push({
          household_id: h.id,
          trip_id: null,
          subject: h.display_name,
          reason: `No contact in ${m} ${m === 1 ? "month" : "months"}`,
        });
      }
      break;
    }

    // Triggers with no data source wired yet match nothing.
    case "birthday":
    case "anniversary":
    case "custom":
    default:
      break;
  }

  return out.slice(0, MAX_CANDIDATES);
}

// ─── Action builders ────────────────────────────────────────────────────────
// What Luna produces when a candidate fires. Drafts are templated and UK
// English (no em dashes, no filler), ready for a human to review and send. The
// same Claude pattern used by the brief route can replace these templates
// later without changing anything else.

export type BuiltAction =
  | { kind: "create_task"; title: string; description: string }
  | { kind: "add_note"; body: string }
  | { kind: "draft_email"; subject: string; body: string };

export function buildAction(
  journey: Journey,
  candidate: Candidate,
  householdName: string
): BuiltAction {
  const firstName = householdName.split(/\s|&/)[0]?.trim() || "there";

  if (journey.action_kind === "create_task") {
    const baseTitle =
      (journey.action_config?.title as string) || journey.name;
    return {
      kind: "create_task",
      title: baseTitle,
      description: candidate.reason,
    };
  }

  if (journey.action_kind === "add_note") {
    return {
      kind: "add_note",
      body: `${journey.name}: ${candidate.reason}`,
    };
  }

  // draft_email
  if (journey.trigger_kind === "days_after_return") {
    const place = candidate.destination ? ` from ${candidate.destination}` : "";
    return {
      kind: "draft_email",
      subject: candidate.destination
        ? `Welcome home, how was ${candidate.destination}?`
        : "Welcome home",
      body: [
        `Hi ${firstName},`,
        "",
        `Welcome back${place}. We hope it was everything you wanted and that the journey home was smooth.`,
        "",
        "When you have a moment we would love to hear how it went. Anything that worked brilliantly, anything we should note for next time. It all helps us look after you better.",
        "",
        "And whenever you start thinking about the next one, we are here.",
        "",
        "Warm wishes,",
        "Andy",
      ].join("\n"),
    };
  }

  // no_contact_period / generic re-engagement
  return {
    kind: "draft_email",
    subject: "Thinking about your next trip",
    body: [
      `Hi ${firstName},`,
      "",
      "It has been a while since we last spoke and you came to mind today. No agenda, just wanted to check in and see how you are.",
      "",
      "If a trip is anywhere on your horizon, even loosely, I would be glad to put a few ideas together for you. No pressure at all.",
      "",
      "Either way it would be lovely to hear from you.",
      "",
      "Warm wishes,",
      "Andy",
    ].join("\n"),
  };
}
