/**
 * Query tool: trips_by_destination
 *
 * Answers "who's travelling to Greece", "show me all our Maldives trips",
 * "anyone going to Italy". Matches on destination text OR country code.
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
  return new Date(s).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export const tripsByDestination: QueryTool = {
  name: "trips_by_destination",
  description:
    "Find trips/customers going to a particular destination or country. Use for questions naming a place (a country, city or resort), e.g. who is travelling to Greece, show me Maldives bookings.",
  examples: [
    "Who's travelling to Greece?",
    "Show me everyone going to the Maldives",
    "Anyone booked for Italy?",
    "Our Spain trips",
  ],
  params: [
    {
      name: "place",
      type: "string",
      required: true,
      description: "The destination to search for: a country name, ISO country code, city or resort. e.g. 'Greece', 'GR', 'Crete'.",
    },
  ],
  run: async (args, ctx): Promise<QueryResult> => {
    const place = String(args.place ?? "").trim();
    if (!place) return listResult([], "No destination given.");

    // Match destination text OR country code (case-insensitive contains).
    const { data: trips } = await ctx.db
      .from("trips")
      .select("id, household_id, destination, destination_country, depart_date, total_value, stage")
      .eq("agency_id", ctx.agencyId)
      .neq("stage", "cancelled")
      .or(`destination.ilike.%${place}%,destination_country.ilike.%${place}%`)
      .order("depart_date", { ascending: true });

    const tripRows = (trips ?? []) as {
      id: string; household_id: string; destination: string | null;
      destination_country: string | null; depart_date: string | null;
      total_value: number | null; stage: string;
    }[];

    if (tripRows.length === 0) {
      return listResult([], `No trips found for "${place}".`);
    }

    const hhIds = [...new Set(tripRows.map((t) => t.household_id))];
    const { data: households } = await ctx.db
      .from("households").select("id, display_name, tags").in("id", hhIds);
    const hhMap = new Map(
      ((households ?? []) as { id: string; display_name: string; tags: string[] | null }[]).map((h) => [h.id, h])
    );

    const rows: ResultRow[] = [];
    const vipIds: string[] = [];
    let totalValue = 0;

    for (const t of tripRows) {
      const hh = hhMap.get(t.household_id);
      const isVip = (hh?.tags ?? []).some((tag) => /vip/i.test(tag));
      const badges: string[] = [];
      if (isVip) { badges.push("VIP"); vipIds.push(t.household_id); }
      badges.push(t.stage);
      totalValue += t.total_value ?? 0;

      rows.push({
        id: t.household_id,
        href: `/customers/${t.household_id}`,
        title: hh?.display_name ?? "Unknown household",
        subtitle: [t.destination, fmtDate(t.depart_date), fmtMoney(t.total_value)].filter(Boolean).join(" · "),
        badges,
        meta: { destination: t.destination, value: t.total_value, stage: t.stage },
      });
    }

    const signals: Signal[] = [];
    if (vipIds.length > 0) {
      signals.push({
        kind: "vip_in_set",
        detail: `${[...new Set(vipIds)].length} VIP ${[...new Set(vipIds)].length === 1 ? "household" : "households"} in this set`,
        rowIds: [...new Set(vipIds)],
        severity: "opportunity",
      });
    }
    signals.push({
      kind: "set_value",
      detail: `${fmtMoney(totalValue)} total value across ${rows.length} ${rows.length === 1 ? "trip" : "trips"}`,
      severity: "info",
    });

    return listResult(rows, `${rows.length} ${rows.length === 1 ? "trip" : "trips"} for "${place}".`, signals, true);
  },
};
