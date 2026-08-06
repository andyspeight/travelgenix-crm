/**
 * Query tool: find_enquiries
 *
 * Filter enquiries by budget and status group, with optional destination and
 * departure-date window. Answers "enquiries with a budget over £8,000 awaiting
 * a response", "new enquiries to Greece", "closed enquiries worth more than
 * £5k".
 *
 * enquiries_awaiting_response owns the SLA/response-clock view; this tool is
 * the plain budget/status/destination filter. Budget is filtered in the DB (a
 * NULL budget can't clear a threshold, so it's correctly excluded). Note a
 * budget may be recorded per-person or as a total — the basis is shown on each
 * row and the threshold compares the raw figure as entered.
 */

import {
  type QueryTool,
  type QueryResult,
  type ResultRow,
  type Signal,
  listResult,
} from "../contract";

const STATUS_GROUPS: Record<string, string[]> = {
  // No first response logged yet — "awaiting", "unanswered", "new".
  awaiting: ["new"],
  // Still live (not converted or closed).
  open: ["new", "responded"],
  converted: ["converted"],
  closed: ["closed"],
  all: [],
};

const STATUS_GROUP_LABEL: Record<string, string> = {
  awaiting: "awaiting a response",
  open: "still open",
  converted: "converted",
  closed: "closed",
  all: "",
};

const STATUS_LABELS: Record<string, string> = {
  new: "New",
  responded: "Responded",
  converted: "Converted",
  closed: "Closed",
};

const SORTS = ["value_desc", "value_asc", "depart_asc", "depart_desc", "received_desc"];

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

type EnquiryRow = {
  id: string;
  household_id: string | null;
  status: string;
  contact_name: string | null;
  destination: string | null;
  depart_date: string | null;
  budget: number | null;
  budget_basis: "total" | "per_person" | null;
  received_at: string;
};

export const findEnquiries: QueryTool = {
  name: "find_enquiries",
  description:
    "Filter enquiries by budget and status, with optional destination and departure date. Use whenever the question puts a money threshold on enquiries (over/under/between a budget), on its own or with a status/destination, e.g. 'enquiries with a budget over £8,000 awaiting a response', 'closed enquiries worth more than £5k', 'new enquiries to Greece over £3000'. For the SLA/overdue view, prefer enquiries_awaiting_response.",
  examples: [
    "Enquiries with a budget over £8,000 awaiting a response",
    "Closed enquiries worth more than £5k",
    "New enquiries to Greece over £3000",
    "Highest budget enquiries still open",
  ],
  params: [
    { name: "min_value", type: "number", required: false, description: "Only enquiries with a budget of at least this many pounds." },
    { name: "max_value", type: "number", required: false, description: "Only enquiries with a budget of at most this many pounds." },
    {
      name: "status_group",
      type: "enum",
      required: false,
      description:
        "Enquiry status grouping. 'awaiting' = new, no response logged yet (unanswered); 'open' = still live (new or responded); 'converted'; 'closed'; 'all' = no status filter. Omit if the question doesn't restrict by status.",
      options: Object.keys(STATUS_GROUPS),
    },
    { name: "destination", type: "string", required: false, description: "Filter to a destination the enquiry mentions (e.g. 'Greece', 'Maldives')." },
    { name: "depart_from", type: "date", required: false, description: "Earliest requested departure date (inclusive), ISO date." },
    { name: "depart_to", type: "date", required: false, description: "Latest requested departure date (inclusive), ISO date." },
    { name: "sort", type: "enum", required: false, description: "Ordering. Defaults to value_desc (biggest budget first).", options: SORTS },
  ],
  run: async (args, ctx): Promise<QueryResult> => {
    const minValue = args.min_value != null ? Number(args.min_value) : null;
    const maxValue = args.max_value != null ? Number(args.max_value) : null;
    const group = typeof args.status_group === "string" && args.status_group in STATUS_GROUPS ? args.status_group : "all";
    const destination = typeof args.destination === "string" ? args.destination.trim() : "";
    const departFrom = typeof args.depart_from === "string" && args.depart_from ? args.depart_from : null;
    const departTo = typeof args.depart_to === "string" && args.depart_to ? args.depart_to : null;
    const sort = typeof args.sort === "string" && SORTS.includes(args.sort) ? args.sort : "value_desc";

    const statuses = STATUS_GROUPS[group];

    let q = ctx.db
      .from("enquiries")
      .select("id, household_id, status, contact_name, destination, depart_date, budget, budget_basis, received_at")
      .eq("agency_id", ctx.agencyId);

    if (statuses.length > 0) q = q.in("status", statuses);
    if (minValue != null && Number.isFinite(minValue)) q = q.gte("budget", minValue);
    if (maxValue != null && Number.isFinite(maxValue)) q = q.lte("budget", maxValue);
    if (departFrom) q = q.gte("depart_date", departFrom);
    if (departTo) q = q.lte("depart_date", departTo);

    const { data } = await q.limit(500);
    let enquiries = (data ?? []) as EnquiryRow[];

    if (destination) {
      const needle = destination.toLowerCase();
      enquiries = enquiries.filter((e) => (e.destination ?? "").toLowerCase().includes(needle));
    }

    enquiries.sort((a, b) => {
      switch (sort) {
        case "value_asc":
          return (a.budget ?? 0) - (b.budget ?? 0);
        case "depart_asc":
          return (a.depart_date ?? "9999") < (b.depart_date ?? "9999") ? -1 : 1;
        case "depart_desc":
          return (a.depart_date ?? "0") > (b.depart_date ?? "0") ? -1 : 1;
        case "received_desc":
          return (a.received_at ?? "0") > (b.received_at ?? "0") ? -1 : 1;
        case "value_desc":
        default:
          return (b.budget ?? 0) - (a.budget ?? 0);
      }
    });

    const filterPhrase = describeFilter({ minValue, maxValue, group, destination, departFrom, departTo });

    if (enquiries.length === 0) {
      return listResult([], `No enquiries match${filterPhrase ? ` ${filterPhrase}` : ""}.`);
    }

    const hhIds = [...new Set(enquiries.map((e) => e.household_id).filter(Boolean) as string[])];
    const { data: households } = hhIds.length
      ? await ctx.db.from("households").select("id, display_name").in("id", hhIds)
      : { data: [] };
    const nameById = new Map(
      ((households ?? []) as { id: string; display_name: string }[]).map((h) => [h.id, h.display_name])
    );

    const rows: ResultRow[] = [];
    let totalValue = 0;

    for (const e of enquiries) {
      totalValue += e.budget ?? 0;
      const budgetBit = e.budget != null ? `${fmtMoney(e.budget)}${e.budget_basis === "per_person" ? " pp" : ""}` : "";
      const title = e.household_id ? nameById.get(e.household_id) ?? e.contact_name ?? "Unknown household" : e.contact_name ?? "New enquiry";
      rows.push({
        id: e.household_id ?? e.id,
        href: e.household_id ? `/customers/${e.household_id}` : "/enquiries",
        title,
        subtitle: [e.destination, e.depart_date ? fmtDate(e.depart_date) : "", budgetBit].filter(Boolean).join(" · "),
        badges: [STATUS_LABELS[e.status] ?? e.status],
        meta: { status: e.status, budget: e.budget, basis: e.budget_basis, destination: e.destination },
      });
    }

    const signals: Signal[] = [
      { kind: "set_value", detail: `${fmtMoneyExact(totalValue)} of budget across ${rows.length} ${rows.length === 1 ? "enquiry" : "enquiries"}`, severity: "opportunity" },
    ];
    const top = enquiries[0];
    if (rows.length > 1 && (top.budget ?? 0) > 0 && sort.startsWith("value")) {
      const topName = top.household_id ? nameById.get(top.household_id) ?? top.contact_name ?? "a customer" : top.contact_name ?? "an enquiry";
      signals.push({
        kind: "top_enquiry",
        detail: `Biggest budget is ${fmtMoney(top.budget)}${top.budget_basis === "per_person" ? " pp" : ""} — ${topName}${top.destination ? ` (${top.destination})` : ""}`,
        rowIds: [top.household_id ?? top.id],
        severity: "opportunity",
      });
    }
    const awaiting = enquiries.filter((e) => e.status === "new").length;
    if (awaiting > 0 && group !== "awaiting") {
      signals.push({ kind: "awaiting_response", detail: `${awaiting} of these ${awaiting === 1 ? "is" : "are"} still awaiting a first response`, severity: "warning" });
    }

    const summary = `${rows.length} ${rows.length === 1 ? "enquiry" : "enquiries"}${filterPhrase ? ` ${filterPhrase}` : ""} (${fmtMoneyExact(totalValue)} of budget).`;
    return listResult(rows, summary, signals, true);
  },
};

function describeFilter(f: {
  minValue: number | null;
  maxValue: number | null;
  group: string;
  destination: string;
  departFrom: string | null;
  departTo: string | null;
}): string {
  const parts: string[] = [];
  const statusLabel = STATUS_GROUP_LABEL[f.group];
  if (statusLabel) parts.push(statusLabel);
  if (f.destination) parts.push(`to ${f.destination}`);
  if (f.minValue != null && f.maxValue != null) parts.push(`budget between ${fmtMoneyExact(f.minValue)} and ${fmtMoneyExact(f.maxValue)}`);
  else if (f.minValue != null) parts.push(`budget over ${fmtMoneyExact(f.minValue)}`);
  else if (f.maxValue != null) parts.push(`budget under ${fmtMoneyExact(f.maxValue)}`);
  if (f.departFrom && f.departTo) parts.push(`departing ${fmtDate(f.departFrom)}–${fmtDate(f.departTo)}`);
  else if (f.departFrom) parts.push(`departing after ${fmtDate(f.departFrom)}`);
  else if (f.departTo) parts.push(`departing before ${fmtDate(f.departTo)}`);
  return parts.join(", ");
}
