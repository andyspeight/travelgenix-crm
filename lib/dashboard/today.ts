/**
 * "Needs you today" — one list, from every source that produces work.
 *
 * The dashboard used to show four panels that were all the same job: an
 * enquiry on the clock, a quote going cold, a message triaged as urgent, and
 * a Luna suggestion. Four boxes, four scans, and the agent doing the merge in
 * their head — which is the one part software should be doing.
 *
 * So this merges them into one ranked list and the dashboard renders it. The
 * panels are gone, not hidden: each item carries the reason it is here and
 * one place to go, so the list IS the summary rather than an index of
 * summaries.
 *
 * THE RANKING RULE, and it is deliberately blunt so it can be explained to an
 * agent who disagrees with the order:
 *
 *   1. A PROMISE ALREADY BROKEN. A first response past its due time. The
 *      customer is waiting right now and we said we would not be.
 *   2. A DEADLINE THAT MOVES ON ITS OWN. A quote about to expire, a departure
 *      approaching, a passport that will not make it. Wait a day and the
 *      option is worth less or gone.
 *   3. A PROMISE ABOUT TO BREAK. A response clock running but not yet out.
 *   4. EVERYTHING ELSE, by how loudly its own detector rated it.
 *
 * Ties break by who has been waiting longest, never by value. Ranking a
 * customer's wait by what they spent is the kind of thing a CRM does quietly
 * and an agency would never say out loud.
 *
 * Pure functions, no I/O.
 */

export type TodayKind =
  | "enquiry"
  | "quote"
  | "message"
  | "case"
  | "suggestion"
  | "task"
  | "commission";

export type TodayItem = {
  /** Stable across renders: "enquiry:<id>". */
  id: string;
  kind: TodayKind;
  /** Who it is about, as an agent would say it. */
  who: string;
  /** What it is, in a few words. */
  headline: string;
  /** Why it is on this list at all. Always present. */
  reason: string;
  /** How long it has been waiting, or how long is left. Null when neither applies. */
  timing: string | null;
  /** Where the work happens. */
  href: string;
  /** The button, e.g. "Reply", "Chase". */
  action: string;
  /** True = a promise already broken, drawn differently. */
  breached: boolean;
  /** Sort key. Higher first. Never shown. */
  rank: number;
};

/** Tier weights, spaced so nothing inside a tier can jump the one above it. */
const TIER = { breached: 4000, deadline: 3000, running: 2000, other: 1000 } as const;

export type TodayInputs = {
  now: Date;
  enquiries: {
    id: string;
    who: string | null;
    destination: string | null;
    receivedAt: string;
    /** From lib/enquiries/clock. */
    state: "responded" | "ok" | "warning" | "overdue";
    label: string;
    remainingMs: number;
  }[];
  quotes: {
    quoteId: string;
    householdId: string | null;
    severity: 1 | 2 | 3;
    title: string;
    reason: string;
    actionLabel: string;
    /** True when the reason is a date running out rather than silence. */
    deadline: boolean;
  }[];
  messages: {
    id: string;
    householdId: string | null;
    subject: string | null;
    occurredAt: string;
    reason: string | null;
  }[];
  suggestions: {
    id: string;
    householdId: string;
    severity: 1 | 2 | 3;
    title: string;
    reason: string;
    href: string;
    actionLabel: string;
    /** Passport and departure risks are deadlines; "gone quiet" is not. */
    deadline: boolean;
  }[];
  /** Open tasks already past their due date. */
  tasks: { id: string; title: string; householdId: string | null; dueAt: string }[];
  /** Open service cases at priority 1 or 2 — someone's holiday is going wrong. */
  cases: {
    id: string;
    householdId: string | null;
    subject: string;
    priority: number;
    reason: string | null;
    slaDueAt: string | null;
  }[];
  /** Commission a supplier owes and is late paying — money, not admin. */
  commission: {
    tripId: string;
    supplierName: string;
    amount: number;
    daysOverdue: number;
    reason: string;
  }[];
  /** household id → display name. */
  nameById: Map<string, string>;
};

const HOUR = 3_600_000;

/** "3 days", "19 hours", "40 minutes" — how long, in the largest honest unit. */
export function humanGap(ms: number): string {
  const abs = Math.abs(ms);
  if (abs < HOUR) {
    const mins = Math.max(1, Math.round(abs / 60_000));
    return `${mins} minute${mins === 1 ? "" : "s"}`;
  }
  if (abs < 48 * HOUR) {
    const hours = Math.round(abs / HOUR);
    return `${hours} hour${hours === 1 ? "" : "s"}`;
  }
  const days = Math.round(abs / (24 * HOUR));
  return `${days} day${days === 1 ? "" : "s"}`;
}

export function buildToday(i: TodayInputs): TodayItem[] {
  const items: TodayItem[] = [];
  const nowMs = i.now.getTime();
  const waited = (iso: string) => Math.max(0, nowMs - new Date(iso).getTime());

  // ─── Enquiries on the response clock ────────────────────────────────────
  for (const e of i.enquiries) {
    if (e.state === "responded") continue;
    const overdue = e.state === "overdue";
    const who = e.who?.trim() || "A new enquiry";
    items.push({
      id: `enquiry:${e.id}`,
      kind: "enquiry",
      who,
      headline: e.destination ? `Enquiry about ${e.destination}` : "New enquiry",
      reason: overdue
        ? `Waiting ${humanGap(waited(e.receivedAt))} — past the response time you promise.`
        : `Waiting ${humanGap(waited(e.receivedAt))}. ${e.label}.`,
      timing: e.label,
      href: "/enquiries",
      action: "Reply",
      breached: overdue,
      // Inside a tier, the longest wait comes first.
      rank: (overdue ? TIER.breached : TIER.running) + Math.min(999, waited(e.receivedAt) / HOUR),
    });
  }

  // ─── Quotes going cold ──────────────────────────────────────────────────
  for (const q of i.quotes) {
    const who = (q.householdId && i.nameById.get(q.householdId)) || "A customer";
    items.push({
      id: `quote:${q.quoteId}`,
      kind: "quote",
      who,
      headline: q.title,
      reason: q.reason,
      timing: null,
      href: "/quotes",
      action: q.actionLabel,
      breached: false,
      rank: (q.deadline ? TIER.deadline : TIER.other) + q.severity * 100,
    });
  }

  // ─── Messages triaged as today's work ───────────────────────────────────
  for (const m of i.messages) {
    const who = (m.householdId && i.nameById.get(m.householdId)) || "A customer";
    items.push({
      id: `message:${m.id}`,
      kind: "message",
      who,
      headline: m.subject?.trim() || "New message",
      reason: m.reason?.trim() || `Came in ${humanGap(waited(m.occurredAt))} ago and Luna rated it today's work.`,
      timing: null,
      href: "/inbox?lane=today",
      action: "Open",
      breached: false,
      rank: TIER.running + Math.min(999, waited(m.occurredAt) / HOUR),
    });
  }

  // ─── Overdue tasks ──────────────────────────────────────────────────────
  for (const t of i.tasks) {
    const who = (t.householdId && i.nameById.get(t.householdId)) || "No customer attached";
    items.push({
      id: `task:${t.id}`,
      kind: "task",
      who,
      headline: t.title,
      reason: `Was due ${humanGap(waited(t.dueAt))} ago.`,
      timing: null,
      href: "/tasks",
      action: "Open",
      breached: true,
      rank: TIER.breached + Math.min(999, waited(t.dueAt) / HOUR),
    });
  }

  // ─── Service cases ──────────────────────────────────────────────────────
  // A customer with a problem outranks a customer we would like to sell to,
  // so a case past its promised response sits with the broken promises.
  for (const c of i.cases) {
    const late = Boolean(c.slaDueAt && new Date(c.slaDueAt).getTime() < nowMs);
    items.push({
      id: `case:${c.id}`,
      kind: "case",
      who: (c.householdId && i.nameById.get(c.householdId)) || "A customer",
      headline: c.subject,
      reason: late
        ? `${c.reason ?? "Open service case"} — past the time you promised to come back.`
        : c.reason ?? "Open service case, high priority.",
      timing: null,
      href: "/service",
      action: "Open",
      breached: late,
      rank:
        (late ? TIER.breached : TIER.deadline) +
        (c.priority === 1 ? 200 : 100) +
        (c.slaDueAt ? Math.min(799, Math.max(0, nowMs - new Date(c.slaDueAt).getTime()) / HOUR) : 0),
    });
  }

  // ─── Commission the agency is owed ──────────────────────────────────────
  // Late money is a promise broken TO the agency rather than by it, and it is
  // the only row here that is worth cash the moment it is actioned.
  for (const c of i.commission) {
    items.push({
      id: `commission:${c.tripId}`,
      kind: "commission",
      who: c.supplierName,
      headline: `£${Math.round(c.amount).toLocaleString("en-GB")} unpaid commission`,
      reason: c.reason,
      timing: null,
      href: "/commission",
      action: "Chase",
      breached: true,
      rank: TIER.breached + Math.min(999, c.daysOverdue * 3),
    });
  }

  // ─── What Luna noticed ──────────────────────────────────────────────────
  for (const s of i.suggestions) {
    items.push({
      id: `suggestion:${s.id}`,
      kind: "suggestion",
      who: i.nameById.get(s.householdId) ?? "A customer",
      headline: s.title,
      reason: s.reason,
      timing: null,
      href: s.href,
      action: s.actionLabel,
      breached: false,
      rank: (s.deadline ? TIER.deadline : TIER.other) + s.severity * 100,
    });
  }

  return items.sort((a, b) => b.rank - a.rank);
}

/**
 * What the list says about itself, in one sentence. Shown above the list, so
 * the agent knows the shape of the day before reading a single row.
 *
 * Counts what is there. It never says "you're all caught up" while holding
 * items, and never invents urgency to sound useful.
 */
export function summariseToday(items: TodayItem[]): string {
  if (items.length === 0) return "Nothing is waiting on you.";

  const breached = items.filter((x) => x.breached).length;
  const parts: string[] = [];

  if (breached > 0) {
    parts.push(`${breached} past ${breached === 1 ? "its" : "their"} due time`);
  }
  const rest = items.length - breached;
  if (rest > 0) parts.push(`${rest} to look at`);

  return `${parts.join(", ")}.`;
}
