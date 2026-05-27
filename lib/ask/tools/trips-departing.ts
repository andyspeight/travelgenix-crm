/**
 * Query tool: trips_departing
 *
 * Answers "who's travelling this weekend / next month / between X and Y".
 * The first tool, built end to end as the proof of the contract — including
 * the deterministic signals that feed Luna's insight layer.
 *
 * Signals computed here (all provably true, never invented):
 *   - vip_in_set: any travelling households tagged VIP
 *   - passport_risk: a traveller's passport expires within 6 months of departure
 *   - high_value: notably high-value trips in the set
 */

import {
  type QueryTool,
  type QueryResult,
  type ResultRow,
  type Signal,
  listResult,
} from "../contract";

const PASSPORT_MARGIN_DAYS = 183;

function fmtMoney(n: number | null): string {
  if (n == null) return "";
  if (n >= 1000) return `£${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  return `£${Math.round(n).toLocaleString("en-GB")}`;
}

function fmtDate(s: string | null): string {
  if (!s) return "";
  return new Date(s).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export const tripsDeparting: QueryTool = {
  name: "trips_departing",
  description:
    "Find trips/customers travelling (departing) within a date range. Use for questions about who is travelling this weekend, next week, next month, or between two specific dates.",
  examples: [
    "Who's travelling this weekend?",
    "Show me everyone departing next month",
    "Who is travelling between 1 June and 15 June?",
    "List departures this week",
  ],
  params: [
    { name: "from", type: "date", required: true, description: "Start of the departure window (inclusive), ISO date." },
    { name: "to", type: "date", required: true, description: "End of the departure window (inclusive), ISO date." },
  ],
  run: async (args, ctx): Promise<QueryResult> => {
    const from = String(args.from);
    const to = String(args.to);

    // Trips departing in window, not cancelled.
    const { data: trips } = await ctx.db
      .from("trips")
      .select("id, household_id, destination, destination_country, depart_date, return_date, total_value, stage")
      .eq("agency_id", ctx.agencyId)
      .gte("depart_date", from)
      .lte("depart_date", to)
      .neq("stage", "cancelled")
      .order("depart_date", { ascending: true });

    const tripRows = (trips ?? []) as {
      id: string;
      household_id: string;
      destination: string | null;
      destination_country: string | null;
      depart_date: string | null;
      return_date: string | null;
      total_value: number | null;
      stage: string;
    }[];

    if (tripRows.length === 0) {
      return listResult([], `No trips departing between ${fmtDate(from)} and ${fmtDate(to)}.`);
    }

    // Households for names + VIP tags.
    const hhIds = [...new Set(tripRows.map((t) => t.household_id))];
    const { data: households } = await ctx.db
      .from("households")
      .select("id, display_name, tags")
      .in("id", hhIds);
    const hhMap = new Map(
      ((households ?? []) as { id: string; display_name: string; tags: string[] | null }[]).map((h) => [h.id, h])
    );

    // Contacts for passport risk.
    const { data: contacts } = await ctx.db
      .from("contacts")
      .select("household_id, first_name, passport_expiry")
      .in("household_id", hhIds);
    const contactsByHh = new Map<string, { first_name: string; passport_expiry: string | null }[]>();
    for (const c of (contacts ?? []) as { household_id: string; first_name: string; passport_expiry: string | null }[]) {
      const arr = contactsByHh.get(c.household_id) ?? [];
      arr.push(c);
      contactsByHh.set(c.household_id, arr);
    }

    // Build rows + collect signals.
    const rows: ResultRow[] = [];
    const vipIds: string[] = [];
    const passportRiskIds: string[] = [];
    const highValueIds: string[] = [];

    for (const t of tripRows) {
      const hh = hhMap.get(t.household_id);
      const name = hh?.display_name ?? "Unknown household";
      const isVip = (hh?.tags ?? []).some((tag) => /vip/i.test(tag));
      const badges: string[] = [];
      if (isVip) {
        badges.push("VIP");
        vipIds.push(t.household_id);
      }

      // Passport risk: any traveller's passport within 6 months of departure.
      if (t.depart_date) {
        const depMs = new Date(t.depart_date).getTime();
        for (const c of contactsByHh.get(t.household_id) ?? []) {
          if (!c.passport_expiry) continue;
          const marginDays = (new Date(c.passport_expiry).getTime() - depMs) / 86400000;
          if (marginDays < PASSPORT_MARGIN_DAYS) {
            badges.push("Passport risk");
            passportRiskIds.push(t.household_id);
            break;
          }
        }
      }

      if ((t.total_value ?? 0) >= 10000) highValueIds.push(t.household_id);

      const dateBit = t.return_date
        ? `${fmtDate(t.depart_date)}–${fmtDate(t.return_date)}`
        : fmtDate(t.depart_date);
      const subtitle = [t.destination, dateBit, fmtMoney(t.total_value)]
        .filter(Boolean)
        .join(" · ");

      rows.push({
        id: t.household_id,
        href: `/customers/${t.household_id}`,
        title: name,
        subtitle,
        badges,
        meta: { destination: t.destination, depart: t.depart_date, value: t.total_value },
      });
    }

    // Signals (deterministic).
    const signals: Signal[] = [];
    if (passportRiskIds.length > 0) {
      signals.push({
        kind: "passport_risk",
        detail: `${passportRiskIds.length} ${passportRiskIds.length === 1 ? "traveller has" : "travellers have"} a passport expiring within 6 months of departure`,
        rowIds: [...new Set(passportRiskIds)],
        severity: "warning",
      });
    }
    if (vipIds.length > 0) {
      signals.push({
        kind: "vip_in_set",
        detail: `${[...new Set(vipIds)].length} VIP ${[...new Set(vipIds)].length === 1 ? "household is" : "households are"} travelling in this window`,
        rowIds: [...new Set(vipIds)],
        severity: "opportunity",
      });
    }
    if (highValueIds.length > 0) {
      signals.push({
        kind: "high_value",
        detail: `${[...new Set(highValueIds)].length} high-value ${highValueIds.length === 1 ? "trip" : "trips"} (£10k+) in this set`,
        rowIds: [...new Set(highValueIds)],
        severity: "info",
      });
    }

    const summary = `${rows.length} ${rows.length === 1 ? "trip" : "trips"} departing between ${fmtDate(from)} and ${fmtDate(to)}.`;
    return listResult(rows, summary, signals, true);
  },
};
