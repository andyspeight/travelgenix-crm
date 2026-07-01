/**
 * Query tool: customers_gone_quiet
 *
 * Answers "which customers have gone quiet", "who haven't we spoken to in a
 * year", "lapsed customers". Mirrors the journeys no-contact matcher: past
 * customers (they have history) whose last interaction or booking is older
 * than the threshold. Signals surface the value at risk.
 */

import {
  type QueryTool,
  type QueryResult,
  type ResultRow,
  type Signal,
  listResult,
} from "../contract";
import { buildLastContactMap } from "@/lib/journeys/engine";
import type { Household } from "@/lib/supabase/types";

function fmtMoney(n: number | null): string {
  if (n == null) return "£0";
  if (n >= 1000) return `£${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  return `£${Math.round(n).toLocaleString("en-GB")}`;
}

export const customersGoneQuiet: QueryTool = {
  name: "customers_gone_quiet",
  description:
    "Find past customers who have gone quiet: no contact or booking for a given number of months (default 12). Use for 'who's gone quiet', 'lapsed customers', 'who haven't we heard from', 'dormant customers', 're-engagement candidates'.",
  examples: [
    "Which customers have gone quiet?",
    "Who haven't we spoken to in over a year?",
    "Show me lapsed customers",
    "Re-engagement candidates",
  ],
  params: [
    {
      name: "months",
      type: "number",
      required: false,
      description: "Quiet threshold in months (default 12).",
    },
  ],
  run: async (args, ctx): Promise<QueryResult> => {
    const months = Math.min(Math.max(Number(args.months) || 12, 1), 60);
    const thresholdDays = months * 30;

    const [{ data: households }, { data: ixRows }] = await Promise.all([
      ctx.db
        .from("households")
        .select("id, display_name, city, tags, lifetime_value, trips_count, customer_since, last_booking_at")
        .eq("agency_id", ctx.agencyId),
      ctx.db.from("interactions").select("household_id, occurred_at").eq("agency_id", ctx.agencyId),
    ]);

    const lastContact = buildLastContactMap(
      (ixRows ?? []) as { household_id: string | null; occurred_at: string }[]
    );

    const quiet: { h: Household; days: number }[] = [];
    for (const h of (households ?? []) as Household[]) {
      const isCustomer = (h.trips_count ?? 0) > 0 || Boolean(h.customer_since);
      if (!isCustomer) continue;
      const last = lastContact.get(h.id) ?? h.last_booking_at ?? h.customer_since;
      if (!last) continue;
      const days = Math.floor((ctx.now.getTime() - new Date(last).getTime()) / 86400000);
      if (days >= thresholdDays) quiet.push({ h, days });
    }

    quiet.sort((a, b) => (b.h.lifetime_value ?? 0) - (a.h.lifetime_value ?? 0));
    const top = quiet.slice(0, 15);

    if (top.length === 0) {
      return listResult([], `No customers quiet for ${months}+ months. Everyone has been in touch recently.`);
    }

    const rows: ResultRow[] = top.map(({ h, days }) => ({
      id: h.id,
      href: `/customers/${h.id}`,
      title: h.display_name,
      subtitle: [`quiet ${Math.round(days / 30)} months`, fmtMoney(h.lifetime_value), h.city].filter(Boolean).join(" · "),
      badges: (h.tags ?? []).slice(0, 2),
    }));

    const atRisk = quiet.reduce((s, q) => s + (q.h.lifetime_value ?? 0), 0);
    const signals: Signal[] = [
      {
        kind: "value_at_risk",
        detail: `${fmtMoney(atRisk)} of lifetime value sits with ${quiet.length} quiet ${quiet.length === 1 ? "customer" : "customers"}`,
        severity: "warning",
      },
    ];
    if (top[0] && (top[0].h.lifetime_value ?? 0) > 0) {
      signals.push({
        kind: "top_reengage",
        detail: `${top[0].h.display_name} is the most valuable to win back at ${fmtMoney(top[0].h.lifetime_value)}`,
        severity: "opportunity",
        rowIds: [top[0].h.id],
      });
    }

    const summary = `${quiet.length} ${quiet.length === 1 ? "customer" : "customers"} quiet for ${months}+ months${quiet.length > top.length ? ` (showing top ${top.length} by value)` : ""}.`;
    return listResult(rows, summary, signals, true);
  },
};
