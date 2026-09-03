/**
 * The account maths for a Travelify order: what has been paid, what is still
 * owed, and what is due next.
 *
 * Travelify is the source of truth for bookings, payments and documents; the
 * CRM models none of it. This file is a faithful port of the My Booking
 * widget's paidOf / buildSchedule / reconcileSchedule / computeNextDue /
 * computeOutstanding (tg-widgets, public/widget-mybooking.js), which in turn
 * mirror /api/pay-balance, so the figure a traveller sees in the portal is
 * the figure the widget shows and the basket charges.
 *
 * Pure functions, no I/O.
 */

export type TravelifyScheduleEntry = {
  num?: number | null;
  amount: number | null;
  dueDate: string | null;
};

export type TravelifyDepositOption = {
  initialAmount: number | null;
  currency: string | null;
  breakdown: TravelifyScheduleEntry[];
} | null;

export type TravelifyDocument = {
  name: string | null;
  ext: string | null;
  size: number | null;
  url: string;
  created: string | null;
};

/** The trimmed order as /api/retrieve-order returns it (the fields we read). */
export type TravelifyOrder = {
  id: number | null;
  status: string | null;
  currency: string | null;
  created: string | null;
  summary?: { totalPrice?: number | null } | null;
  voucher?: { code: string | null; name: string | null; value: number } | null;
  paidToDate?: number | null;
  depositOption?: TravelifyDepositOption;
  documents?: TravelifyDocument[];
  items?: Array<{
    product?: string | null;
    price?: number | null;
    accommodation?: { pricing?: { memberPrice?: number | null; price?: number | null } | null } | null;
  }>;
};

export type ScheduleLine = { amount: number; dueDate: string | null; isInitial: boolean };

export type NextDue = {
  amount: number;
  /** ISO date; "today" when something is already due. */
  dueDate: string | null;
  remainingAmount: number;
  isInstalment: boolean;
};

export type AccountBalance = {
  total: number;
  voucher: number;
  netTotal: number;
  paid: number;
  outstanding: number;
  /** The unpaid schedule, earliest first. Empty when there is no schedule. */
  schedule: ScheduleLine[];
  next: NextDue | null;
};

const r2 = (n: number) => Math.round(n * 100) / 100;

function paidOf(order: TravelifyOrder): number {
  const p = order.paidToDate;
  return typeof p === "number" && p > 0 ? p : 0;
}

/** The FULL schedule, earliest first: the initial amount (due now) plus every instalment. */
function buildSchedule(order: TravelifyOrder): Array<ScheduleLine & { due: number }> {
  const dep = order.depositOption;
  if (!dep || typeof dep !== "object") return [];
  const entries: Array<ScheduleLine & { due: number }> = [];
  const initial = Number(dep.initialAmount);
  if (Number.isFinite(initial) && initial > 0) {
    entries.push({ amount: r2(initial), dueDate: null, due: -Infinity, isInitial: true });
  }
  for (const b of Array.isArray(dep.breakdown) ? dep.breakdown : []) {
    const amount = Number(b.amount);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    const due = Date.parse(b.dueDate ?? "");
    entries.push({
      amount: r2(amount),
      dueDate: b.dueDate || null,
      due: Number.isFinite(due) ? due : Infinity,
      isInitial: false,
    });
  }
  entries.sort((a, b) => a.due - b.due);
  return entries;
}

/** The UNPAID schedule: payments taken settle the earliest entries first. */
export function reconcileSchedule(order: TravelifyOrder): ScheduleLine[] {
  const all = buildSchedule(order);
  if (!all.length) return [];
  let left = r2(Math.max(0, paidOf(order)));
  const out: ScheduleLine[] = [];
  for (const e of all) {
    const settle = Math.min(e.amount, left);
    const unpaid = r2(e.amount - settle);
    left = r2(left - settle);
    if (unpaid > 0) out.push({ amount: unpaid, dueDate: e.dueDate, isInitial: e.isInitial });
  }
  return out;
}

function isoToday(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/** What to collect now: everything already due, else the next instalment. */
export function computeNextDue(order: TravelifyOrder, now: Date = new Date()): NextDue | null {
  const entries = reconcileSchedule(order);
  if (!entries.length) return null;
  const today = isoToday(now);
  let dueNow = 0;
  let firstFuture: ScheduleLine | null = null;
  for (const e of entries) {
    const isDue = e.isInitial || (e.dueDate ? e.dueDate.slice(0, 10) <= today : false);
    if (isDue) dueNow = r2(dueNow + e.amount);
    else if (!firstFuture) firstFuture = e;
  }
  const total = r2(entries.reduce((s, e) => s + e.amount, 0));
  const amount = dueNow > 0 ? dueNow : firstFuture ? firstFuture.amount : 0;
  const dueDate = dueNow > 0 ? today : firstFuture ? firstFuture.dueDate : null;
  return {
    amount,
    dueDate,
    remainingAmount: r2(total - amount),
    isInstalment: entries.length > 1,
  };
}

/** The authoritative account position for an order. */
export function computeAccount(order: TravelifyOrder, now: Date = new Date()): AccountBalance {
  const items = Array.isArray(order.items) ? order.items : [];
  const summary = order.summary ?? {};
  const accItem = items.find((i) => i.product === "Accommodation" || i.product === "Packages") ?? null;
  const pricing = accItem?.accommodation?.pricing ?? null;
  const total =
    typeof summary.totalPrice === "number" && summary.totalPrice > 0
      ? summary.totalPrice
      : pricing?.memberPrice ?? pricing?.price ?? accItem?.price ?? 0;
  const voucher = order.voucher && typeof order.voucher.value === "number" ? order.voucher.value : 0;
  const netTotal = r2(total + voucher);
  const paid = paidOf(order);
  const schedule = reconcileSchedule(order);
  const outstanding = schedule.length
    ? r2(schedule.reduce((s, e) => s + e.amount, 0))
    : Math.max(0, r2(netTotal - paid));
  return {
    total,
    voucher,
    netTotal,
    paid,
    outstanding,
    schedule,
    next: computeNextDue(order, now),
  };
}
