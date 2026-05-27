/**
 * Query tool: trips_recently_returned
 *
 * Answers "who's just got back", "who returned recently", "anyone home in the
 * last fortnight". The post-trip follow-up workflow: check-in calls, review
 * requests, rebooking nudges while the trip is fresh.
 */

import {
  type QueryTool,
  type QueryResult,
  type ResultRow,
  type Signal,
  listResult,
} from "../contract";

function fmtMoney(n: number | null): string {
  if (n == null) return "";
  if (n >= 1000) return `£${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  return `£${Math.round(n).toLocaleString("en-GB")}`;
}
function fmtDate(s: string | null): string {
  if (!s) return "";
  return new Date(s).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export const tripsRecentlyReturned: QueryTool = {
  name: "trips_recently_returned",
  description:
    "Find customers who have recently returned from a trip, for post-trip follow-up (check-in, review request, rebooking). Use for questions about who has just got back, who returned recently, or who is home from holiday.",
  examples: [
    "Who's just got back?",
    "Who returned in the last two weeks?",
    "Anyone home from holiday recently?",
    "Customers to follow up post-trip",
  ],
  params: [
    {
      name: "days",
      type: "number",
      required: false,
      description: "How many days back to look for returns (default 21).",
    },
  ],
  run: async (args, ctx): Promise<QueryResult> => {
    const days = Math.min(Math.max(Number(args.days) || 21, 1), 365);
    const cutoff = new Date(ctx.now.getTime() - days * 86400000).toISOString().slice(0, 10);
    const todayIso = ctx.now.toISOString().slice(0, 10);

    // Returned trips whose return_date is within the window (and not future).
    const { data: trips } = await ctx.db
      .from("trips")
      .select("id, household_id, destination, return_date, total_value, stage")
      .eq("agency_id", ctx.agencyId)
      .eq("stage", "returned")
      .gte("return_date", cutoff)
      .lte("return_date", todayIso)
      .order("return_date", { ascending: false });

    const tripRows = (trips ?? []) as {
      id: string; household_id: string; destination: string | null;
      return_date: string | null; total_value: number | null; stage: string;
    }[];

    if (tripRows.length === 0) {
      return listResult([], `No customers have returned in the last ${days} days.`);
    }

    const hhIds = [...new Set(tripRows.map((t) => t.household_id))];
    const { data: households } = await ctx.db
      .from("households").select("id, display_name, tags").in("id", hhIds);
    const hhMap = new Map(
      ((households ?? []) as { id: string; display_name: string; tags: string[] | null }[]).map((h) => [h.id, h])
    );

    const rows: ResultRow[] = [];
    const vipIds: string[] = [];

    for (const t of tripRows) {
      const hh = hhMap.get(t.household_id);
      const isVip = (hh?.tags ?? []).some((tag) => /vip/i.test(tag));
      const badges: string[] = [];
      if (isVip) { badges.push("VIP"); vipIds.push(t.household_id); }

      rows.push({
        id: t.household_id,
        href: `/customers/${t.household_id}`,
        title: hh?.display_name ?? "Unknown household",
        subtitle: [t.destination, t.return_date ? `back ${fmtDate(t.return_date)}` : "", fmtMoney(t.total_value)].filter(Boolean).join(" · "),
        badges,
      });
    }

    const signals: Signal[] = [
      {
        kind: "follow_up_window",
        detail: `${rows.length} ${rows.length === 1 ? "customer is" : "customers are"} freshly back, the best moment for a review request or rebooking nudge`,
        severity: "opportunity",
      },
    ];
    if (vipIds.length > 0) {
      signals.push({
        kind: "vip_follow_up",
        detail: `${[...new Set(vipIds)].length} VIP ${[...new Set(vipIds)].length === 1 ? "household" : "households"} worth a personal call`,
        rowIds: [...new Set(vipIds)],
        severity: "opportunity",
      });
    }

    return listResult(rows, `${rows.length} ${rows.length === 1 ? "customer" : "customers"} returned in the last ${days} days.`, signals, true);
  },
};
