/**
 * Query tool: rebooking_due
 *
 * Answers "who's due to rebook?", "which repeat customers have nothing booked?",
 * "who's in their booking window?". Runs the SAME rebooking detector the Suggest
 * feed and dashboard use (lib/suggest/detectors.ts) — a repeat customer inside
 * their own historic booking cadence with nothing ahead — so Luna and the
 * suggestion cards can't disagree. Ranked by lifetime value.
 */

import {
  type QueryTool,
  type QueryResult,
  type ResultRow,
  type Signal,
  listResult,
} from "../contract";
import { computeSuggestions } from "@/lib/suggest/detectors";
import type { Household, Contact, Trip } from "@/lib/supabase/types";

function fmtMoney(n: number | null): string {
  if (n == null) return "£0";
  if (n >= 1000) return `£${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  return `£${Math.round(n).toLocaleString("en-GB")}`;
}

export const rebookingDue: QueryTool = {
  name: "rebooking_due",
  description:
    "Find repeat customers who are due to book again: inside their own historic booking cadence with nothing currently ahead. Use for 'who's due to rebook', 'repeat customers with nothing booked', 'who's in their booking window', 'rebooking opportunities', 'who should we prompt to book'.",
  examples: [
    "Who's due to rebook?",
    "Repeat customers with nothing booked",
    "Who's in their booking window?",
    "Rebooking opportunities",
    "Who should we prompt to book again?",
  ],
  params: [],
  run: async (_args, ctx): Promise<QueryResult> => {
    const [{ data: hhs }, { data: cs }, { data: ts }] = await Promise.all([
      ctx.db.from("households").select("*").eq("agency_id", ctx.agencyId),
      ctx.db.from("contacts").select("*").eq("agency_id", ctx.agencyId),
      ctx.db.from("trips").select("*").eq("agency_id", ctx.agencyId),
    ]);

    const households = (hhs ?? []) as Household[];
    const valueById = new Map(households.map((h) => [h.id, h.lifetime_value ?? 0]));

    const contactsByHh = new Map<string, Contact[]>();
    for (const c of (cs ?? []) as Contact[]) {
      const a = contactsByHh.get(c.household_id) ?? [];
      a.push(c);
      contactsByHh.set(c.household_id, a);
    }
    const tripsByHh = new Map<string, Trip[]>();
    for (const t of (ts ?? []) as Trip[]) {
      if (!t.household_id) continue;
      const a = tripsByHh.get(t.household_id) ?? [];
      a.push(t);
      tripsByHh.set(t.household_id, a);
    }

    const rebook = computeSuggestions(households, contactsByHh, tripsByHh, ctx.now)
      .filter((s) => s.kind === "rebooking_window")
      .sort((a, b) => (valueById.get(b.householdId) ?? 0) - (valueById.get(a.householdId) ?? 0));

    if (rebook.length === 0) {
      return listResult([], "No customers are in their rebooking window right now.");
    }

    const rows: ResultRow[] = rebook.slice(0, 25).map((s) => ({
      id: s.householdId,
      href: s.href,
      title: s.title,
      subtitle: [fmtMoney(valueById.get(s.householdId) ?? 0), s.reason].filter(Boolean).join(" · "),
    }));

    const potential = rebook.reduce((sum, s) => sum + (valueById.get(s.householdId) ?? 0), 0);
    const signals: Signal[] = [
      {
        kind: "rebooking_due",
        detail: `${rebook.length} repeat customer${rebook.length === 1 ? "" : "s"} in their booking window, ${fmtMoney(potential)} of past value between them`,
        severity: "opportunity",
        rowIds: rebook.slice(0, 10).map((s) => s.householdId),
      },
    ];

    const summary = `${rebook.length} customer${rebook.length === 1 ? "" : "s"} due to rebook (by value).`;
    return listResult(rows, summary, signals, true);
  },
};
