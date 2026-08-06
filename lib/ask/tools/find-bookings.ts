/**
 * Query tool: find_bookings
 *
 * The general "filter the bookings" tool. Where trips_by_stage answers a single
 * plain-stage question, this one answers ANY combination of:
 *   - a money threshold        (over £5,000 / under £2,000 / between X and Y)
 *   - a stage GROUP            (yet to travel / in the pipeline / returned …)
 *   - a destination            (Spain, Crete, the Maldives)
 *   - a departure date window  (after / before / between)
 *
 * This is the tool that unlocks questions like "show me all bookings yet to
 * travel that were more than £5000" — a value threshold combined with a stage
 * group, which no single-purpose tool could express.
 *
 * Everything is computed from real rows; the signals are deterministic. Value
 * filtering is done in the DB (a NULL total_value can't be "over £5,000", so
 * it's correctly excluded); destination and the "not yet departed" guard are
 * applied in code so the intent stays explicit and testable.
 */

import {
  type QueryTool,
  type QueryResult,
  type ResultRow,
  type Signal,
  listResult,
} from "../contract";

/** Plain-language stage groupings the router can map a question onto. */
const STAGE_GROUPS: Record<string, string[]> = {
  // Confirmed and still to depart — "yet to travel", "upcoming", "not gone yet".
  yet_to_travel: ["booked", "pre_departure"],
  // Away right now.
  travelling: ["travelling"],
  // Still a lead — not yet a booking.
  in_pipeline: ["enquiry", "quoted"],
  // Every trip that became a real booking (matches how revenue is counted).
  confirmed: ["booked", "pre_departure", "travelling", "returned"],
  // Been and back.
  returned: ["returned"],
  cancelled: ["cancelled"],
  // No stage filter at all.
  all: [],
};

const STAGE_GROUP_LABEL: Record<string, string> = {
  yet_to_travel: "yet to travel",
  travelling: "currently travelling",
  in_pipeline: "in the pipeline",
  confirmed: "confirmed",
  returned: "returned",
  cancelled: "cancelled",
  all: "",
};

const STAGE_LABELS: Record<string, string> = {
  enquiry: "Enquiry",
  quoted: "Quoted",
  booked: "Booked",
  pre_departure: "Pre-departure",
  travelling: "Travelling",
  returned: "Returned",
  cancelled: "Cancelled",
};

const SORTS = ["value_desc", "value_asc", "depart_asc", "depart_desc"];

function fmtMoney(n: number | null): string {
  if (n == null) return "";
  if (n >= 1000) return `£${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  return `£${Math.round(n).toLocaleString("en-GB")}`;
}
function fmtMoneyExact(n: number): string {
  return `£${Math.round(n).toLocaleString("en-GB")}`;
}
function fmtDate(s: string | null): string {
  if (!s) return "";
  return new Date(s).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

type TripRow = {
  id: string;
  household_id: string;
  destination: string | null;
  destination_country: string | null;
  depart_date: string | null;
  return_date: string | null;
  total_value: number | null;
  stage: string;
};

export const findBookings: QueryTool = {
  name: "find_bookings",
  description:
    "Filter bookings/trips by any combination of value, stage group, destination and departure date. This is THE tool whenever the question puts a money threshold on bookings (over/under/between a price), on its own or combined with a stage or date, e.g. 'bookings over £5,000 yet to travel', 'trips to Spain under £2,000 this year', 'cancelled bookings worth more than £10k'. Prefer the simpler trips_by_stage only for a plain single-stage question with no value threshold.",
  examples: [
    "Show me all bookings yet to travel that were more than £5000",
    "Which trips to Greece are worth over £8k?",
    "Bookings between £2000 and £5000 departing next month",
    "Cancelled trips worth more than £10,000",
    "Highest value bookings not yet travelled",
  ],
  params: [
    { name: "min_value", type: "number", required: false, description: "Only bookings worth at least this many pounds (e.g. 5000 for 'over £5,000')." },
    { name: "max_value", type: "number", required: false, description: "Only bookings worth at most this many pounds (e.g. 2000 for 'under £2,000')." },
    {
      name: "stage_group",
      type: "enum",
      required: false,
      description:
        "A plain-language stage grouping. 'yet_to_travel' = confirmed and not yet departed (upcoming/not gone yet); 'travelling' = away right now; 'in_pipeline' = still an enquiry or quote (not booked); 'confirmed' = every real booking; 'returned' = been and back; 'cancelled'; 'all' = no stage filter. Omit if the question doesn't restrict by stage.",
      options: Object.keys(STAGE_GROUPS),
    },
    { name: "destination", type: "string", required: false, description: "Filter to a destination — matches the trip's destination or country (e.g. 'Spain', 'Crete')." },
    { name: "depart_from", type: "date", required: false, description: "Earliest departure date (inclusive), ISO date. Resolve relative phrases using today's date." },
    { name: "depart_to", type: "date", required: false, description: "Latest departure date (inclusive), ISO date. Resolve relative phrases using today's date." },
    { name: "sort", type: "enum", required: false, description: "Ordering. Defaults to value_desc (most valuable first).", options: SORTS },
  ],
  run: async (args, ctx): Promise<QueryResult> => {
    const minValue = typeof args.min_value === "number" ? args.min_value : args.min_value != null ? Number(args.min_value) : null;
    const maxValue = typeof args.max_value === "number" ? args.max_value : args.max_value != null ? Number(args.max_value) : null;
    const group = typeof args.stage_group === "string" && args.stage_group in STAGE_GROUPS ? args.stage_group : "all";
    const destination = typeof args.destination === "string" ? args.destination.trim() : "";
    const departFrom = typeof args.depart_from === "string" && args.depart_from ? args.depart_from : null;
    const departTo = typeof args.depart_to === "string" && args.depart_to ? args.depart_to : null;
    const sort = typeof args.sort === "string" && SORTS.includes(args.sort) ? args.sort : "value_desc";

    const stages = STAGE_GROUPS[group];
    const today = ctx.now.toISOString().slice(0, 10);

    let q = ctx.db
      .from("trips")
      .select("id, household_id, destination, destination_country, depart_date, return_date, total_value, stage")
      .eq("agency_id", ctx.agencyId);

    if (stages.length > 0) q = q.in("stage", stages);
    if (minValue != null && Number.isFinite(minValue)) q = q.gte("total_value", minValue);
    if (maxValue != null && Number.isFinite(maxValue)) q = q.lte("total_value", maxValue);
    if (departFrom) q = q.gte("depart_date", departFrom);
    if (departTo) q = q.lte("depart_date", departTo);

    const { data } = await q.limit(500);
    let trips = (data ?? []) as TripRow[];

    // Destination match in code (destination OR country substring), so a single
    // filter catches "Spain" whether it's stored as the resort or the country.
    if (destination) {
      const needle = destination.toLowerCase();
      trips = trips.filter(
        (t) =>
          (t.destination ?? "").toLowerCase().includes(needle) ||
          (t.destination_country ?? "").toLowerCase().includes(needle)
      );
    }

    // "Yet to travel" means not already departed: keep undeparted (or undated)
    // trips even if the row is still sat at 'booked' with a stale past date.
    if (group === "yet_to_travel") {
      trips = trips.filter((t) => !t.depart_date || t.depart_date >= today);
    }

    // Sort (in code, so it holds regardless of what the DB returned).
    trips.sort((a, b) => {
      switch (sort) {
        case "value_asc":
          return (a.total_value ?? 0) - (b.total_value ?? 0);
        case "depart_asc":
          return (a.depart_date ?? "9999") < (b.depart_date ?? "9999") ? -1 : 1;
        case "depart_desc":
          return (a.depart_date ?? "0") > (b.depart_date ?? "0") ? -1 : 1;
        case "value_desc":
        default:
          return (b.total_value ?? 0) - (a.total_value ?? 0);
      }
    });

    const filterPhrase = describeFilter({ minValue, maxValue, group, destination, departFrom, departTo });

    if (trips.length === 0) {
      return listResult([], `No bookings match${filterPhrase ? ` ${filterPhrase}` : ""}.`);
    }

    // Households for names + VIP tags.
    const hhIds = [...new Set(trips.map((t) => t.household_id))];
    const { data: households } = await ctx.db
      .from("households")
      .select("id, display_name, tags")
      .in("id", hhIds);
    const hhMap = new Map(
      ((households ?? []) as { id: string; display_name: string; tags: string[] | null }[]).map((h) => [h.id, h])
    );

    const rows: ResultRow[] = [];
    const vipIds: string[] = [];
    let totalValue = 0;

    for (const t of trips) {
      const hh = hhMap.get(t.household_id);
      const isVip = (hh?.tags ?? []).some((tag) => /vip/i.test(tag));
      const badges: string[] = [];
      if (isVip) {
        badges.push("VIP");
        vipIds.push(t.household_id);
      }
      // Show the stage when the set can span more than one, so it's legible.
      if (group === "all" || (stages.length !== 1)) {
        badges.push(STAGE_LABELS[t.stage] ?? t.stage);
      }
      totalValue += t.total_value ?? 0;

      const place = t.destination ?? t.destination_country ?? "";
      rows.push({
        id: t.household_id,
        href: `/customers/${t.household_id}`,
        title: hh?.display_name ?? "Unknown household",
        subtitle: [place, fmtDate(t.depart_date), fmtMoney(t.total_value)].filter(Boolean).join(" · "),
        badges,
        meta: { destination: place, depart: t.depart_date, value: t.total_value, stage: t.stage },
      });
    }

    const signals: Signal[] = [
      {
        kind: "set_value",
        detail: `${fmtMoneyExact(totalValue)} across ${rows.length} ${rows.length === 1 ? "booking" : "bookings"}`,
        severity: "info",
      },
    ];
    const top = trips[0];
    if (rows.length > 1 && (top.total_value ?? 0) > 0 && sort.startsWith("value")) {
      const topName = hhMap.get(top.household_id)?.display_name ?? "a customer";
      signals.push({
        kind: "top_booking",
        detail: `Biggest is ${fmtMoney(top.total_value)} — ${topName}${top.destination ? ` to ${top.destination}` : ""}`,
        rowIds: [top.household_id],
        severity: "opportunity",
      });
    }
    if (vipIds.length > 0) {
      const n = new Set(vipIds).size;
      signals.push({
        kind: "vip_in_set",
        detail: `${n} VIP ${n === 1 ? "household" : "households"} in this set`,
        rowIds: [...new Set(vipIds)],
        severity: "opportunity",
      });
    }

    const summary = `${rows.length} ${rows.length === 1 ? "booking" : "bookings"}${filterPhrase ? ` ${filterPhrase}` : ""} (${fmtMoneyExact(totalValue)} total).`;
    return listResult(rows, summary, signals, true);
  },
};

/** Build a short human phrase describing the filters that were applied. */
function describeFilter(f: {
  minValue: number | null;
  maxValue: number | null;
  group: string;
  destination: string;
  departFrom: string | null;
  departTo: string | null;
}): string {
  const parts: string[] = [];

  const stageLabel = STAGE_GROUP_LABEL[f.group];
  if (stageLabel) parts.push(stageLabel);

  if (f.destination) parts.push(`to ${f.destination}`);

  if (f.minValue != null && f.maxValue != null) parts.push(`worth between ${fmtMoneyExact(f.minValue)} and ${fmtMoneyExact(f.maxValue)}`);
  else if (f.minValue != null) parts.push(`worth over ${fmtMoneyExact(f.minValue)}`);
  else if (f.maxValue != null) parts.push(`worth under ${fmtMoneyExact(f.maxValue)}`);

  if (f.departFrom && f.departTo) parts.push(`departing ${fmtDate(f.departFrom)}–${fmtDate(f.departTo)}`);
  else if (f.departFrom) parts.push(`departing after ${fmtDate(f.departFrom)}`);
  else if (f.departTo) parts.push(`departing before ${fmtDate(f.departTo)}`);

  return parts.join(", ");
}
