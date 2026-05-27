/**
 * Query tool: trips_by_stage
 *
 * Answers "what's at quote stage", "show me everything in pre-departure",
 * "which trips are still enquiries". Maps a plain-language stage word to the
 * trip_stage enum.
 */

import {
  type QueryTool,
  type QueryResult,
  type ResultRow,
  type Signal,
  listResult,
} from "../contract";

const STAGES = ["enquiry", "quoted", "booked", "pre_departure", "travelling", "returned", "cancelled"];

const STAGE_LABELS: Record<string, string> = {
  enquiry: "Enquiry",
  quoted: "Quoted",
  booked: "Booked",
  pre_departure: "Pre-departure",
  travelling: "Travelling",
  returned: "Returned",
  cancelled: "Cancelled",
};

function fmtMoney(n: number | null): string {
  if (n == null) return "";
  if (n >= 1000) return `£${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  return `£${Math.round(n).toLocaleString("en-GB")}`;
}
function fmtDate(s: string | null): string {
  if (!s) return "";
  return new Date(s).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export const tripsByStage: QueryTool = {
  name: "trips_by_stage",
  description:
    "Find trips at a particular pipeline stage. Use for questions about the sales pipeline by stage, e.g. what is at quote stage, show me pre-departure trips, which are still enquiries, what has returned.",
  examples: [
    "What's at quote stage?",
    "Show me everything in pre-departure",
    "Which trips are still enquiries?",
    "What have we got booked but not departed?",
  ],
  params: [
    {
      name: "stage",
      type: "enum",
      required: true,
      description: "The pipeline stage to filter by.",
      options: STAGES,
    },
  ],
  run: async (args, ctx): Promise<QueryResult> => {
    const stage = String(args.stage ?? "").trim();
    if (!STAGES.includes(stage)) {
      return listResult([], "That isn't a stage I recognise.");
    }

    const { data: trips } = await ctx.db
      .from("trips")
      .select("id, household_id, destination, depart_date, total_value, stage")
      .eq("agency_id", ctx.agencyId)
      .eq("stage", stage)
      .order("depart_date", { ascending: true });

    const tripRows = (trips ?? []) as {
      id: string; household_id: string; destination: string | null;
      depart_date: string | null; total_value: number | null; stage: string;
    }[];

    const label = STAGE_LABELS[stage] ?? stage;
    if (tripRows.length === 0) {
      return listResult([], `Nothing at ${label.toLowerCase()} stage right now.`);
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
      totalValue += t.total_value ?? 0;

      rows.push({
        id: t.household_id,
        href: `/customers/${t.household_id}`,
        title: hh?.display_name ?? "Unknown household",
        subtitle: [t.destination, fmtDate(t.depart_date), fmtMoney(t.total_value)].filter(Boolean).join(" · "),
        badges,
      });
    }

    const signals: Signal[] = [
      {
        kind: "stage_value",
        detail: `${fmtMoney(totalValue)} of value sitting at ${label.toLowerCase()} stage`,
        severity: stage === "quoted" || stage === "enquiry" ? "opportunity" : "info",
      },
    ];
    if (vipIds.length > 0) {
      signals.push({
        kind: "vip_in_set",
        detail: `${[...new Set(vipIds)].length} VIP ${[...new Set(vipIds)].length === 1 ? "household" : "households"} in this set`,
        rowIds: [...new Set(vipIds)],
        severity: "opportunity",
      });
    }

    return listResult(rows, `${rows.length} ${rows.length === 1 ? "trip" : "trips"} at ${label.toLowerCase()} stage.`, signals, true);
  },
};
