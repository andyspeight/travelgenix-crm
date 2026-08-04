/**
 * Query tool: currently_travelling
 *
 * Answers "who's away right now?", "anyone in-destination today?", "who's
 * currently on holiday?". A trip is live-away when today falls between its
 * departure and return. Date-driven rather than trusting the stage flag, so it
 * stays right even if a stage wasn't advanced by hand.
 *
 * High operational value: duty of care while customers are abroad, and timing
 * the welcome-home follow-up for those about to return.
 */

import {
  type QueryTool,
  type QueryResult,
  type ResultRow,
  type Signal,
  listResult,
} from "../contract";
import type { Trip, Household } from "@/lib/supabase/types";

function fmtDate(s: string | null): string {
  if (!s) return "";
  return new Date(s.length <= 10 ? `${s}T00:00:00` : s).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export const currentlyTravelling: QueryTool = {
  name: "currently_travelling",
  description:
    "List customers who are away/travelling right now — today falls between their departure and return. Use for 'who's away right now', 'anyone in-destination today', 'who's on holiday currently', 'who's abroad', 'who's due back soon'.",
  examples: [
    "Who's away right now?",
    "Anyone in-destination today?",
    "Who's currently on holiday?",
    "Which customers are abroad this week?",
    "Who's due back in the next few days?",
  ],
  params: [],
  run: async (_args, ctx): Promise<QueryResult> => {
    const today = ctx.now.toISOString().slice(0, 10);

    const [{ data: tripRows }, { data: households }] = await Promise.all([
      ctx.db
        .from("trips")
        .select("id, household_id, destination, destination_country, depart_date, return_date, total_value, stage")
        .eq("agency_id", ctx.agencyId)
        .neq("stage", "cancelled")
        .lte("depart_date", today)
        .gte("return_date", today)
        .limit(200),
      ctx.db.from("households").select("id, display_name, tags").eq("agency_id", ctx.agencyId),
    ]);

    const hhById = new Map<string, Pick<Household, "display_name" | "tags">>(
      ((households ?? []) as Household[]).map((h) => [h.id, { display_name: h.display_name, tags: h.tags }])
    );
    const trips = (tripRows ?? []) as Pick<
      Trip,
      "id" | "household_id" | "destination" | "destination_country" | "depart_date" | "return_date" | "total_value" | "stage"
    >[];

    if (trips.length === 0) {
      return listResult([], "Nobody's away right now.");
    }

    const nowMs = ctx.now.getTime();
    const dayMs = 86_400_000;
    const daysToReturn = (ret: string | null) =>
      ret ? Math.round((Date.parse(`${ret.slice(0, 10)}T00:00:00`) - nowMs) / dayMs) : null;

    // Soonest to return first — those are the pressing welcome-home ones.
    trips.sort((a, b) => (daysToReturn(a.return_date) ?? 999) - (daysToReturn(b.return_date) ?? 999));

    const rows: ResultRow[] = trips.map((t) => {
      const hh = t.household_id ? hhById.get(t.household_id) : null;
      const back = daysToReturn(t.return_date);
      const backLabel =
        back == null ? "" : back <= 0 ? "back today" : back === 1 ? "back tomorrow" : `back ${fmtDate(t.return_date)} (${back}d)`;
      const badges: string[] = (hh?.tags ?? []).filter((tg) => tg === "VIP").slice(0, 1);
      if (back != null && back <= 2) badges.push("Returning soon");
      return {
        id: t.id,
        href: t.household_id ? `/customers/${t.household_id}` : "/trips",
        title: hh?.display_name ?? "A customer",
        subtitle: [t.destination, backLabel].filter(Boolean).join(" · "),
        badges,
        meta: { returns_in_days: back },
      };
    });

    const returningSoon = trips.filter((t) => {
      const d = daysToReturn(t.return_date);
      return d != null && d <= 2;
    }).length;
    const vip = trips.filter((t) => t.household_id && (hhById.get(t.household_id)?.tags ?? []).includes("VIP")).length;

    const signals: Signal[] = [
      {
        kind: "away_now",
        detail:
          `${trips.length} ${trips.length === 1 ? "party is" : "parties are"} away right now` +
          (returningSoon ? `, ${returningSoon} back within 2 days` : "") +
          (vip ? `, ${vip} VIP` : ""),
        severity: "info",
      },
    ];

    const summary = `${trips.length} customer${trips.length === 1 ? " is" : "s are"} travelling right now.`;
    return listResult(rows, summary, signals, true);
  },
};
