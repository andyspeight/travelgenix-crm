/**
 * Query tool: business_report
 *
 * Answers "build me a report", "how's business", "give me an overview of this
 * quarter". One period, the headline numbers an owner actually wants: booked
 * revenue, bookings, average value, open pipeline, new customers, plus the top
 * destination — with deterministic signals for the insight layer.
 *
 * Rendered as a list of metric rows (the Ask panel renders list/number/empty),
 * with the booked-revenue figure carried in `value` for the headline.
 */

import {
  type QueryTool,
  type QueryResult,
  type ResultRow,
  type Signal,
  emptyResult,
} from "../contract";
import type { Trip } from "@/lib/supabase/types";

const BOOKED_STAGES = new Set(["booked", "pre_departure", "travelling", "returned"]);
const OPEN_STAGES = new Set(["enquiry", "quoted"]);

function fmtMoney(n: number): string {
  if (n >= 1000) return `£${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  return `£${Math.round(n).toLocaleString("en-GB")}`;
}
function fmtMoneyFull(n: number): string {
  return `£${Math.round(n).toLocaleString("en-GB")}`;
}

export const businessReport: QueryTool = {
  name: "business_report",
  description:
    "Build a business overview report for a date period: booked revenue, number of bookings, average booking value, open pipeline, new customers and top destinations. Use for 'build me a report', 'how is business', 'summary of this month/quarter/year', 'performance overview'.",
  examples: [
    "Build me a report for this year",
    "How's business this quarter?",
    "Give me an overview of last month",
    "Monthly performance summary",
  ],
  params: [
    { name: "from", type: "date", required: true, description: "Start of the reporting period (inclusive), ISO date." },
    { name: "to", type: "date", required: true, description: "End of the reporting period (inclusive), ISO date." },
    { name: "label", type: "string", required: false, description: "A short human label for the period, e.g. 'this year', 'June', 'Q2'." },
  ],
  run: async (args, ctx): Promise<QueryResult> => {
    const from = String(args.from ?? "").slice(0, 10);
    const to = String(args.to ?? "").slice(0, 10);
    const label = args.label ? String(args.label) : `${from} to ${to}`;
    if (!from || !to) return emptyResult("I need a date range for the report.");

    // Trips departing in the period (the basis for booked revenue + bookings),
    // plus current open pipeline (undated by nature) and new customers.
    const [{ data: periodTrips }, { data: openTrips }, { data: newCustomers }] = await Promise.all([
      ctx.db
        .from("trips")
        .select("id, household_id, stage, destination, destination_country, depart_date, total_value")
        .eq("agency_id", ctx.agencyId)
        .gte("depart_date", from)
        .lte("depart_date", to),
      ctx.db
        .from("trips")
        .select("id, stage, total_value")
        .eq("agency_id", ctx.agencyId)
        .in("stage", ["enquiry", "quoted"]),
      ctx.db
        .from("households")
        .select("id, display_name, customer_since")
        .eq("agency_id", ctx.agencyId)
        .gte("customer_since", from)
        .lte("customer_since", to),
    ]);

    const inPeriod = (periodTrips ?? []) as Trip[];
    const booked = inPeriod.filter((t) => BOOKED_STAGES.has(t.stage));
    const open = ((openTrips ?? []) as Trip[]).filter((t) => OPEN_STAGES.has(t.stage));
    const newCount = (newCustomers ?? []).length;

    const bookedValue = booked.reduce((s, t) => s + (t.total_value ?? 0), 0);
    const pipelineValue = open.reduce((s, t) => s + (t.total_value ?? 0), 0);
    const avg = booked.length ? bookedValue / booked.length : 0;

    if (booked.length === 0 && open.length === 0 && newCount === 0) {
      return emptyResult(`Nothing to report for ${label}: no bookings, pipeline or new customers in that period.`);
    }

    // Top destinations by booked value.
    const byDest = new Map<string, number>();
    for (const t of booked) {
      const key = t.destination ?? "Unknown";
      byDest.set(key, (byDest.get(key) ?? 0) + (t.total_value ?? 0));
    }
    const topDests = Array.from(byDest.entries()).sort((a, b) => b[1] - a[1]).slice(0, 3);

    const rows: ResultRow[] = [
      { id: "booked", title: "Booked revenue", subtitle: `${fmtMoneyFull(bookedValue)} from ${booked.length} ${booked.length === 1 ? "booking" : "bookings"} departing in the period` },
      { id: "avg", title: "Average booking", subtitle: booked.length ? fmtMoneyFull(avg) : "No bookings in the period" },
      { id: "pipeline", title: "Open pipeline (now)", subtitle: `${fmtMoneyFull(pipelineValue)} across ${open.length} live ${open.length === 1 ? "enquiry/quote" : "enquiries/quotes"}` },
      { id: "new", title: "New customers", subtitle: `${newCount} joined in the period` },
    ];
    if (topDests.length) {
      rows.push({
        id: "destinations",
        title: "Top destinations",
        subtitle: topDests.map(([d, v]) => `${d} ${fmtMoney(v)}`).join(" · "),
      });
    }

    const signals: Signal[] = [];
    if (topDests[0]) {
      signals.push({
        kind: "top_destination",
        detail: `${topDests[0][0]} leads the period at ${fmtMoney(topDests[0][1])} booked`,
        severity: "info",
      });
    }
    const biggest = booked.slice().sort((a, b) => (b.total_value ?? 0) - (a.total_value ?? 0))[0];
    if (biggest && (biggest.total_value ?? 0) > 0) {
      signals.push({
        kind: "biggest_booking",
        detail: `Biggest booking: ${biggest.destination ?? "a trip"} at ${fmtMoney(biggest.total_value ?? 0)}`,
        severity: "opportunity",
        rowIds: [biggest.id],
      });
    }
    if (pipelineValue > 0 && bookedValue > 0 && pipelineValue > bookedValue * 0.5) {
      signals.push({
        kind: "strong_pipeline",
        detail: `Open pipeline is ${Math.round((pipelineValue / bookedValue) * 100)}% of the period's booked revenue, strong forward demand`,
        severity: "opportunity",
      });
    }

    return {
      shape: "list",
      value: fmtMoney(bookedValue),
      rows,
      summary: `Report for ${label}: ${fmtMoney(bookedValue)} booked across ${booked.length} ${booked.length === 1 ? "booking" : "bookings"}, ${fmtMoney(pipelineValue)} open pipeline, ${newCount} new ${newCount === 1 ? "customer" : "customers"}.`,
      signals,
      actionable: false,
    };
  },
};
