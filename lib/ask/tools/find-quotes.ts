/**
 * Query tool: find_quotes
 *
 * Filter quotes by value (total_price) and status group, with an optional
 * sent-date window. Answers "quotes over £5,000 still unaccepted", "declined
 * quotes worth more than £10k", "quotes under £2,000 sent this month".
 *
 * quotes_at_risk handles the "which live quotes need rescuing" judgement; this
 * tool is the plain value/status filter. Value is filtered in the DB (a NULL
 * total_price can't clear a threshold, so it's correctly excluded); everything
 * shown is computed from real rows.
 */

import {
  type QueryTool,
  type QueryResult,
  type ResultRow,
  type Signal,
  listResult,
} from "../contract";

const STATUS_GROUPS: Record<string, string[]> = {
  // Still in play, awaiting a customer decision — "unaccepted", "live", "open".
  open: ["draft", "sent", "viewed"],
  accepted: ["accepted"],
  declined: ["declined"],
  expired: ["expired"],
  all: [],
};

const STATUS_GROUP_LABEL: Record<string, string> = {
  open: "still open",
  accepted: "accepted",
  declined: "declined",
  expired: "expired",
  all: "",
};

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  sent: "Sent",
  viewed: "Viewed",
  accepted: "Accepted",
  declined: "Declined",
  expired: "Expired",
  superseded: "Superseded",
};

const SORTS = ["value_desc", "value_asc", "sent_desc", "sent_asc"];
const EXPIRING_SOON_DAYS = 7;

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

type QuoteRow = {
  id: string;
  household_id: string | null;
  reference: string | null;
  status: string;
  total_price: number | null;
  sent_at: string | null;
  expires_at: string | null;
};

export const findQuotes: QueryTool = {
  name: "find_quotes",
  description:
    "Filter quotes by value and status. Use whenever the question puts a money threshold on quotes (over/under/between a price), on its own or with a status, e.g. 'quotes over £5,000 still unaccepted', 'declined quotes worth more than £10k', 'accepted quotes this month'. For the judgement of which live quotes are going cold, prefer quotes_at_risk instead.",
  examples: [
    "Quotes over £5,000 still unaccepted",
    "Declined quotes worth more than £10k",
    "Which accepted quotes are over £8000?",
    "Quotes between £2000 and £5000 sent this month",
  ],
  params: [
    { name: "min_value", type: "number", required: false, description: "Only quotes worth at least this many pounds (total price)." },
    { name: "max_value", type: "number", required: false, description: "Only quotes worth at most this many pounds (total price)." },
    {
      name: "status_group",
      type: "enum",
      required: false,
      description:
        "Quote status grouping. 'open' = still awaiting a decision (draft/sent/viewed — i.e. unaccepted/live); 'accepted'; 'declined'; 'expired'; 'all' = no status filter. Omit if the question doesn't restrict by status.",
      options: Object.keys(STATUS_GROUPS),
    },
    { name: "sent_from", type: "date", required: false, description: "Only quotes sent on or after this ISO date. Resolve relative phrases using today's date." },
    { name: "sent_to", type: "date", required: false, description: "Only quotes sent on or before this ISO date. Resolve relative phrases using today's date." },
    { name: "sort", type: "enum", required: false, description: "Ordering. Defaults to value_desc (most valuable first).", options: SORTS },
  ],
  run: async (args, ctx): Promise<QueryResult> => {
    const minValue = args.min_value != null ? Number(args.min_value) : null;
    const maxValue = args.max_value != null ? Number(args.max_value) : null;
    const group = typeof args.status_group === "string" && args.status_group in STATUS_GROUPS ? args.status_group : "all";
    const sentFrom = typeof args.sent_from === "string" && args.sent_from ? args.sent_from : null;
    const sentTo = typeof args.sent_to === "string" && args.sent_to ? args.sent_to : null;
    const sort = typeof args.sort === "string" && SORTS.includes(args.sort) ? args.sort : "value_desc";

    const statuses = STATUS_GROUPS[group];

    let q = ctx.db
      .from("quotes")
      .select("id, household_id, reference, status, total_price, sent_at, expires_at")
      .eq("agency_id", ctx.agencyId);

    if (statuses.length > 0) q = q.in("status", statuses);
    if (minValue != null && Number.isFinite(minValue)) q = q.gte("total_price", minValue);
    if (maxValue != null && Number.isFinite(maxValue)) q = q.lte("total_price", maxValue);
    if (sentFrom) q = q.gte("sent_at", sentFrom);
    if (sentTo) q = q.lte("sent_at", sentTo);

    const { data } = await q.limit(500);
    const quotes = (data ?? []) as QuoteRow[];

    quotes.sort((a, b) => {
      switch (sort) {
        case "value_asc":
          return (a.total_price ?? 0) - (b.total_price ?? 0);
        case "sent_asc":
          return (a.sent_at ?? "9999") < (b.sent_at ?? "9999") ? -1 : 1;
        case "sent_desc":
          return (a.sent_at ?? "0") > (b.sent_at ?? "0") ? -1 : 1;
        case "value_desc":
        default:
          return (b.total_price ?? 0) - (a.total_price ?? 0);
      }
    });

    const filterPhrase = describeFilter({ minValue, maxValue, group, sentFrom, sentTo });

    if (quotes.length === 0) {
      return listResult([], `No quotes match${filterPhrase ? ` ${filterPhrase}` : ""}.`);
    }

    const hhIds = [...new Set(quotes.map((qr) => qr.household_id).filter(Boolean) as string[])];
    const { data: households } = hhIds.length
      ? await ctx.db.from("households").select("id, display_name").in("id", hhIds)
      : { data: [] };
    const nameById = new Map(
      ((households ?? []) as { id: string; display_name: string }[]).map((h) => [h.id, h.display_name])
    );

    const nowMs = ctx.now.getTime();
    const rows: ResultRow[] = [];
    let totalValue = 0;
    let expiringSoon = 0;

    for (const qr of quotes) {
      totalValue += qr.total_price ?? 0;
      const badges = [STATUS_LABELS[qr.status] ?? qr.status];
      const isOpen = ["draft", "sent", "viewed"].includes(qr.status);
      if (isOpen && qr.expires_at) {
        const daysToExpiry = (new Date(qr.expires_at).getTime() - nowMs) / 86400000;
        if (daysToExpiry >= 0 && daysToExpiry <= EXPIRING_SOON_DAYS) {
          badges.push("Expiring soon");
          expiringSoon++;
        }
      }
      rows.push({
        id: qr.household_id ?? qr.id,
        href: qr.household_id ? `/customers/${qr.household_id}` : "/quotes",
        title: qr.household_id ? nameById.get(qr.household_id) ?? "Unknown household" : "Unlinked quote",
        subtitle: [qr.reference, fmtMoney(qr.total_price), qr.sent_at ? `sent ${fmtDate(qr.sent_at)}` : ""].filter(Boolean).join(" · "),
        badges,
        meta: { status: qr.status, value: qr.total_price, sent: qr.sent_at },
      });
    }

    const signals: Signal[] = [
      { kind: "set_value", detail: `${fmtMoneyExact(totalValue)} across ${rows.length} ${rows.length === 1 ? "quote" : "quotes"}`, severity: "info" },
    ];
    const top = quotes[0];
    if (rows.length > 1 && (top.total_price ?? 0) > 0 && sort.startsWith("value")) {
      const topName = top.household_id ? nameById.get(top.household_id) ?? "a customer" : "an unlinked quote";
      signals.push({ kind: "top_quote", detail: `Biggest is ${fmtMoney(top.total_price)} — ${topName}`, rowIds: [top.household_id ?? top.id], severity: "opportunity" });
    }
    if (expiringSoon > 0) {
      signals.push({ kind: "expiring_soon", detail: `${expiringSoon} ${expiringSoon === 1 ? "quote expires" : "quotes expire"} within ${EXPIRING_SOON_DAYS} days`, severity: "warning" });
    }

    const summary = `${rows.length} ${rows.length === 1 ? "quote" : "quotes"}${filterPhrase ? ` ${filterPhrase}` : ""} (${fmtMoneyExact(totalValue)} total).`;
    return listResult(rows, summary, signals, true);
  },
};

function describeFilter(f: {
  minValue: number | null;
  maxValue: number | null;
  group: string;
  sentFrom: string | null;
  sentTo: string | null;
}): string {
  const parts: string[] = [];
  const statusLabel = STATUS_GROUP_LABEL[f.group];
  if (statusLabel) parts.push(statusLabel);
  if (f.minValue != null && f.maxValue != null) parts.push(`worth between ${fmtMoneyExact(f.minValue)} and ${fmtMoneyExact(f.maxValue)}`);
  else if (f.minValue != null) parts.push(`worth over ${fmtMoneyExact(f.minValue)}`);
  else if (f.maxValue != null) parts.push(`worth under ${fmtMoneyExact(f.maxValue)}`);
  if (f.sentFrom && f.sentTo) parts.push(`sent ${fmtDate(f.sentFrom)}–${fmtDate(f.sentTo)}`);
  else if (f.sentFrom) parts.push(`sent after ${fmtDate(f.sentFrom)}`);
  else if (f.sentTo) parts.push(`sent before ${fmtDate(f.sentTo)}`);
  return parts.join(", ");
}
