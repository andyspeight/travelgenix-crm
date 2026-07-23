/**
 * Query tool: quotes_at_risk
 *
 * Answers "which quotes are at risk?", "any quotes going cold?", "what quotes
 * need chasing?". Runs the SAME deterministic Quote Rescue detector the
 * /quotes screen and the Dashboard use (lib/quotes/rescue.ts), so Luna's
 * spoken answer and the UI can never disagree.
 *
 * Signals passed to the insight layer mirror the detector's findings —
 * engaged-but-silent, expiring, never-viewed — all provably true.
 */

import {
  type QueryTool,
  type QueryResult,
  type ResultRow,
  type Signal,
  listResult,
} from "../contract";
import { rescueAlerts, type QuoteTripContext } from "@/lib/quotes/rescue";
import type { Quote } from "@/lib/supabase/types";

export const quotesAtRisk: QueryTool = {
  name: "quotes_at_risk",
  description:
    "Find live quotes that are at risk: viewed repeatedly with no reply, expiring soon, sent but never opened, gone quiet, or with departure approaching. Use for questions about quotes needing attention, going cold, at risk, or needing a chase.",
  examples: [
    "Which quotes are at risk?",
    "Any quotes going cold?",
    "What quotes need chasing today?",
    "Show me quotes that are about to expire",
  ],
  params: [],
  run: async (_args, ctx): Promise<QueryResult> => {
    const { data: quotes } = await ctx.db
      .from("quotes")
      .select("*")
      .eq("agency_id", ctx.agencyId)
      .in("status", ["sent", "viewed"])
      .limit(200);

    const quoteRows = (quotes ?? []) as Quote[];
    if (quoteRows.length === 0) {
      return listResult([], "No live quotes on the book right now, so nothing is at risk.");
    }

    const tripIds = [...new Set(quoteRows.map((q) => q.trip_id))];
    const { data: trips } = await ctx.db
      .from("trips")
      .select("id, destination, depart_date")
      .in("id", tripIds);
    const tripsById = new Map<string, QuoteTripContext>(
      ((trips ?? []) as { id: string; destination: string | null; depart_date: string | null }[]).map(
        (t) => [t.id, { destination: t.destination, depart_date: t.depart_date }]
      )
    );

    const hhIds = [...new Set(quoteRows.map((q) => q.household_id).filter(Boolean))] as string[];
    const { data: households } = hhIds.length
      ? await ctx.db.from("households").select("id, display_name").in("id", hhIds)
      : { data: [] };
    const nameById = new Map(
      ((households ?? []) as { id: string; display_name: string }[]).map((h) => [h.id, h.display_name])
    );

    const alerts = rescueAlerts(quoteRows, tripsById);
    if (alerts.length === 0) {
      return listResult(
        [],
        `All ${quoteRows.length} live quote${quoteRows.length === 1 ? " is" : "s are"} healthy — nothing needs rescuing today.`
      );
    }

    const valueById = new Map(quoteRows.map((q) => [q.id, q.total_price ?? 0]));

    const rows: ResultRow[] = alerts.map((a) => ({
      id: a.householdId ?? a.quoteId,
      href: a.householdId ? `/customers/${a.householdId}` : "/quotes",
      title: a.householdId ? nameById.get(a.householdId) ?? "Unknown household" : "Unlinked quote",
      subtitle: a.title,
      badges: [a.actionLabel],
      meta: { severity: a.severity, signals: a.signals.join(","), reason: a.reason },
    }));

    const signals: Signal[] = [];
    const urgent = alerts.filter((a) => a.severity === 3);
    if (urgent.length > 0) {
      signals.push({
        kind: "act_now",
        detail: `${urgent.length} quote${urgent.length === 1 ? " needs" : "s need"} action today: ${urgent
          .slice(0, 2)
          .map((a) => a.title)
          .join("; ")}`,
        rowIds: urgent.map((a) => a.householdId ?? a.quoteId),
        severity: "warning",
      });
    }
    const engaged = alerts.filter((a) => a.signals.includes("engaged_no_response"));
    if (engaged.length > 0) {
      signals.push({
        kind: "engaged_no_response",
        detail: `${engaged.length} customer${engaged.length === 1 ? " keeps" : "s keep"} re-reading a quote without replying — interest with an unanswered question in it. Phone beats email here.`,
        rowIds: engaged.map((a) => a.householdId ?? a.quoteId),
        severity: "opportunity",
      });
    }
    const atRiskValue = alerts.reduce((s, a) => s + (valueById.get(a.quoteId) ?? 0), 0);
    if (atRiskValue > 0) {
      signals.push({
        kind: "value_at_risk",
        detail: `£${Math.round(atRiskValue).toLocaleString("en-GB")} of quoted business is sitting in the at-risk pile`,
        rowIds: rows.map((r) => r.id),
        severity: "info",
      });
    }

    return listResult(
      rows,
      `${alerts.length} of ${quoteRows.length} live quote${quoteRows.length === 1 ? "" : "s"} at risk.`,
      signals,
      true
    );
  },
};
