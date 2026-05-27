/**
 * Query tool: customers_by_value_or_tag
 *
 * Answers "who are my VIPs", "show me my highest-value customers", "which
 * customers are repeat bookers". Filters households by tag and/or sorts by
 * lifetime value.
 */

import {
  type QueryTool,
  type QueryResult,
  type ResultRow,
  type Signal,
  listResult,
} from "../contract";

function fmtMoney(n: number | null): string {
  if (n == null) return "£0";
  if (n >= 1000) return `£${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  return `£${Math.round(n).toLocaleString("en-GB")}`;
}

export const customersByValueOrTag: QueryTool = {
  name: "customers_by_value_or_tag",
  description:
    "Find customers/households by a tag (like VIP, Repeat, High value, Honeymoon, New) and/or ranked by lifetime value. Use for questions about who the VIPs are, the highest-value or most valuable customers, repeat bookers, or top customers.",
  examples: [
    "Who are my VIPs?",
    "Show me my highest-value customers",
    "Which customers are repeat bookers?",
    "My top 10 customers by value",
  ],
  params: [
    {
      name: "tag",
      type: "string",
      required: false,
      description: "Optional tag to filter by, e.g. 'VIP', 'Repeat', 'High value', 'Honeymoon', 'New'. Omit to rank all customers by value.",
    },
    {
      name: "limit",
      type: "number",
      required: false,
      description: "Optional max number to return (default 10).",
    },
  ],
  run: async (args, ctx): Promise<QueryResult> => {
    const tag = args.tag ? String(args.tag).trim() : null;
    const limit = Math.min(Math.max(Number(args.limit) || 10, 1), 50);

    let query = ctx.db
      .from("households")
      .select("id, display_name, tags, lifetime_value, trips_count, city")
      .eq("agency_id", ctx.agencyId);

    if (tag) {
      // Postgres array contains — match the tag (case-insensitive handled below).
      query = query.contains("tags", [tag]);
    }

    const { data } = await query.order("lifetime_value", { ascending: false }).limit(limit);

    let households = (data ?? []) as {
      id: string; display_name: string; tags: string[] | null;
      lifetime_value: number | null; trips_count: number | null; city: string | null;
    }[];

    // If a tag was given but exact-match found nothing, retry case-insensitively
    // in memory against a broader pull (handles 'vip' vs 'VIP').
    if (tag && households.length === 0) {
      const { data: all } = await ctx.db
        .from("households")
        .select("id, display_name, tags, lifetime_value, trips_count, city")
        .eq("agency_id", ctx.agencyId)
        .order("lifetime_value", { ascending: false });
      households = ((all ?? []) as typeof households)
        .filter((h) => (h.tags ?? []).some((t) => t.toLowerCase() === tag.toLowerCase()))
        .slice(0, limit);
    }

    if (households.length === 0) {
      return listResult([], tag ? `No customers tagged "${tag}".` : "No customers found.");
    }

    const rows: ResultRow[] = households.map((h) => ({
      id: h.id,
      href: `/customers/${h.id}`,
      title: h.display_name,
      subtitle: [fmtMoney(h.lifetime_value), `${h.trips_count ?? 0} trips`, h.city].filter(Boolean).join(" · "),
      badges: (h.tags ?? []).slice(0, 2),
    }));

    const totalValue = households.reduce((s, h) => s + (h.lifetime_value ?? 0), 0);
    const signals: Signal[] = [
      {
        kind: "set_value",
        detail: `${fmtMoney(totalValue)} combined lifetime value across ${rows.length} ${rows.length === 1 ? "household" : "households"}`,
        severity: "info",
      },
    ];
    // Highlight the standout customer.
    if (households.length > 1 && (households[0].lifetime_value ?? 0) > 0) {
      signals.push({
        kind: "top_customer",
        detail: `${households[0].display_name} is the most valuable here at ${fmtMoney(households[0].lifetime_value)}`,
        rowIds: [households[0].id],
        severity: "opportunity",
      });
    }

    const summary = tag
      ? `${rows.length} ${rows.length === 1 ? "customer" : "customers"} tagged "${tag}".`
      : `Top ${rows.length} customers by lifetime value.`;
    return listResult(rows, summary, signals, true);
  },
};
