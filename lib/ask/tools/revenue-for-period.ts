/**
 * Query tool: revenue_for_period
 *
 * Answers "how much did we book last month", "what's departing this quarter".
 * Returns booked value (booked-ish stages) for trips DEPARTING in the window,
 * plus a signal comparing to the previous equivalent period.
 *
 * The word is "turnover", not "revenue": this is gross booking value
 * (total_value), the customer's money passing through, not the agency's
 * income. Commission — the actual revenue — lives on the Commission screen.
 * Calling turnover "revenue" is the exact overstatement the number review
 * exists to catch, so the caption and signals say turnover throughout.
 *
 * The window is measured on departure date, so the caption says "departing
 * between", not "booked between" — a trip booked in January for an August
 * holiday counts in August, and the words must not imply otherwise.
 */

import {
  type QueryTool,
  type QueryResult,
  type Signal,
  numberResult,
} from "../contract";

const BOOKED_STAGES = ["booked", "pre_departure", "travelling", "returned"];

function fmtMoney(n: number): string {
  if (n >= 1000) return `£${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  return `£${Math.round(n).toLocaleString("en-GB")}`;
}
function fmtDate(s: string): string {
  return new Date(s).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

async function sumBooked(ctx: { agencyId: string; db: { from: (t: string) => any } }, from: string, to: string): Promise<number> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const { data } = await ctx.db
    .from("trips")
    .select("total_value, stage, depart_date")
    .eq("agency_id", ctx.agencyId)
    .in("stage", BOOKED_STAGES)
    .gte("depart_date", from)
    .lte("depart_date", to);
  return ((data ?? []) as { total_value: number | null }[]).reduce((s, t) => s + (t.total_value ?? 0), 0);
}

export const revenueForPeriod: QueryTool = {
  name: "revenue_for_period",
  description:
    "Calculate total booked turnover (gross booking value) for trips departing within a date range. Use for questions about how much turnover/value departs in a period, e.g. last month, this quarter, this year, between two dates. Note: this is turnover (the holiday price), not commission — for the agency's income use the Commission screen.",
  examples: [
    "How much did we book for last month?",
    "What's departing this quarter?",
    "Total value departing this year",
    "Turnover between 1 Jan and 31 Mar",
  ],
  params: [
    { name: "from", type: "date", required: true, description: "Start of the period (inclusive), ISO date." },
    { name: "to", type: "date", required: true, description: "End of the period (inclusive), ISO date." },
  ],
  run: async (args, ctx): Promise<QueryResult> => {
    const from = String(args.from);
    const to = String(args.to);

    const total = await sumBooked(ctx, from, to);

    // Prior equivalent period for comparison (same length, immediately before).
    const fromMs = new Date(from).getTime();
    const toMs = new Date(to).getTime();
    const spanMs = toMs - fromMs;
    const prevTo = new Date(fromMs - 86400000).toISOString().slice(0, 10);
    const prevFrom = new Date(fromMs - 86400000 - spanMs).toISOString().slice(0, 10);
    const prevTotal = await sumBooked(ctx, prevFrom, prevTo);

    const signals: Signal[] = [];
    if (prevTotal > 0) {
      const delta = Math.round(((total - prevTotal) / prevTotal) * 100);
      signals.push({
        kind: "period_comparison",
        detail:
          delta >= 0
            ? `Up ${delta}% on the previous equivalent period (${fmtMoney(prevTotal)})`
            : `Down ${Math.abs(delta)}% on the previous equivalent period (${fmtMoney(prevTotal)})`,
        severity: delta >= 0 ? "opportunity" : "warning",
      });
    } else if (total > 0) {
      signals.push({
        kind: "period_comparison",
        detail: "No booked turnover in the previous equivalent period to compare against",
        severity: "info",
      });
    }

    return numberResult(
      fmtMoney(total),
      `${fmtMoney(total)} of turnover departing between ${fmtDate(from)} and ${fmtDate(to)}.`,
      signals
    );
  },
};
