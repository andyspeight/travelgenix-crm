/**
 * Commission — what the agency actually earns.
 *
 * Every report in this CRM has said "revenue" and meant the holiday price.
 * That is the customer's spend, not the agency's income. An agency that sells
 * £2m of holidays might earn £200k, and the £2m number is no use for paying
 * staff, judging a supplier or deciding whether the year is going well.
 *
 * So this is the other number: rate, amount, and — the part agencies actually
 * lose money on — whether the supplier has paid it yet. Chasing unpaid
 * commission is a real job in a real agency and it is normally done from
 * memory and a spreadsheet.
 *
 * THREE RULES, all of them about not lying to the owner:
 *
 *   1. NEVER INVENT A RATE. If no commission is recorded and the supplier has
 *      no default, the answer is "not recorded" — not 10%. A forecast built
 *      on a guessed rate is a number someone will hire against.
 *
 *   2. EARNED AND EXPECTED ARE DIFFERENT NUMBERS. Money received is not money
 *      invoiced is not money hoped for. They are never added together into
 *      one cheerful total.
 *
 *   3. SAY WHAT IS MISSING. A total that quietly omits the bookings with no
 *      rate is worse than no total, because it looks complete. Every summary
 *      carries the count it could not include.
 *
 * Pure functions, no I/O.
 */

export type CommissionStatus = "expected" | "invoiced" | "received" | "written_off";

/** The commission fields a trip carries. */
export type CommissionTrip = {
  id: string;
  /** The sell price — what the customer pays. */
  totalValue: number | null;
  supplierId: string | null;
  /** Percent, e.g. 10 for 10%. Null when not recorded on the booking. */
  commissionRate: number | null;
  /** An explicit amount, which always beats a rate. */
  commissionAmount: number | null;
  status: CommissionStatus;
  /** When the supplier owes it by. Derived from terms when not set. */
  dueAt: string | null;
  receivedAt: string | null;
  departDate: string | null;
  returnDate: string | null;
};

export type CommissionSupplier = {
  id: string;
  name: string;
  /** The agency's usual rate with this supplier. Still a fallback, never a guess. */
  defaultCommissionRate: number | null;
  /** Days after return that this supplier normally pays. */
  paymentTermsDays: number | null;
};

export type CommissionValue = {
  /** Null means we do not know, and null is never treated as zero. */
  amount: number | null;
  /** Where the number came from, so it can be checked. */
  source: "amount" | "trip_rate" | "supplier_rate" | "unknown";
  /** Plain English, shown wherever the number is. */
  reason: string;
};

const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * What this booking earns, and how we know.
 *
 * Order of trust: an amount someone typed in, then a rate on the booking,
 * then the supplier's usual rate. Below that we say we do not know.
 */
export function commissionFor(
  trip: CommissionTrip,
  supplier: CommissionSupplier | null
): CommissionValue {
  if (trip.commissionAmount != null) {
    return {
      amount: round2(trip.commissionAmount),
      source: "amount",
      reason: "Entered by hand on this booking.",
    };
  }

  const sell = trip.totalValue;
  if (trip.commissionRate != null) {
    if (sell == null) {
      return {
        amount: null,
        source: "unknown",
        reason: `${trip.commissionRate}% is recorded, but this booking has no price on it yet.`,
      };
    }
    return {
      amount: round2((sell * trip.commissionRate) / 100),
      source: "trip_rate",
      reason: `${trip.commissionRate}% of ${money(sell)}, the rate recorded on this booking.`,
    };
  }

  if (supplier?.defaultCommissionRate != null) {
    if (sell == null) {
      return {
        amount: null,
        source: "unknown",
        reason: `${supplier.name} usually pays ${supplier.defaultCommissionRate}%, but this booking has no price on it yet.`,
      };
    }
    return {
      amount: round2((sell * supplier.defaultCommissionRate) / 100),
      source: "supplier_rate",
      reason: `${supplier.defaultCommissionRate}% of ${money(sell)} — ${supplier.name}'s usual rate, not confirmed on this booking.`,
    };
  }

  return {
    amount: null,
    source: "unknown",
    reason: supplier
      ? `No commission rate recorded for this booking or for ${supplier.name}.`
      : "No commission recorded, and no supplier set on this booking.",
  };
}

/**
 * When the supplier owes it. An explicit date wins; otherwise the terms
 * counted from the return date, because most operators pay after travel.
 * No terms and no date = we genuinely do not know, and say so.
 */
export function dueDateFor(
  trip: CommissionTrip,
  supplier: CommissionSupplier | null
): { date: string | null; reason: string } {
  if (trip.dueAt) return { date: trip.dueAt.slice(0, 10), reason: "Set on this booking." };

  const terms = supplier?.paymentTermsDays;
  const anchor = trip.returnDate ?? trip.departDate;
  if (terms == null || !anchor) {
    return {
      date: null,
      reason: supplier
        ? `No payment terms recorded for ${supplier.name}, so there is no date to chase against.`
        : "No supplier on this booking, so there is nothing to chase.",
    };
  }

  const date = new Date(`${anchor.slice(0, 10)}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + terms);
  return {
    date: date.toISOString().slice(0, 10),
    reason: `${terms} days after ${trip.returnDate ? "they return" : "departure"} — ${supplier!.name}'s usual terms.`,
  };
}

export type Ageing = {
  state: "received" | "written_off" | "not_due" | "due_soon" | "overdue" | "unknown";
  /** Negative = days until due. Positive = days late. Null when unknown. */
  days: number | null;
  label: string;
};

/** Where this commission stands with the supplier today. */
export function ageingOf(
  trip: CommissionTrip,
  supplier: CommissionSupplier | null,
  now: Date
): Ageing {
  if (trip.status === "received") {
    return { state: "received", days: null, label: "Paid" };
  }
  if (trip.status === "written_off") {
    return { state: "written_off", days: null, label: "Written off" };
  }

  const { date } = dueDateFor(trip, supplier);
  if (!date) {
    return { state: "unknown", days: null, label: "No due date" };
  }

  // Whole days, floored: a due date is a day, not a moment. Something due
  // today is not late, and it should not read as "1 day overdue" by teatime.
  const dueMs = new Date(`${date}T00:00:00Z`).getTime();
  const days = Math.floor((now.getTime() - dueMs) / 86_400_000);

  if (days === 0) {
    return { state: "due_soon", days: 0, label: "Due today" };
  }
  if (days > 0) {
    return {
      state: "overdue",
      days,
      label: `${days} day${days === 1 ? "" : "s"} overdue`,
    };
  }
  if (days > -14) {
    return { state: "due_soon", days, label: `Due in ${Math.abs(days)} day${days === -1 ? "" : "s"}` };
  }
  return { state: "not_due", days, label: `Due ${date}` };
}

export type CommissionSummary = {
  /** Money in the bank: status received. */
  received: number;
  /** Invoiced to the supplier, not yet paid. */
  invoiced: number;
  /** Neither invoiced nor paid — the pipeline of earnings. */
  expected: number;
  /** Invoiced or expected, past its due date. The chase list's total. */
  overdue: number;
  /** What the customers paid, for comparison. */
  turnover: number;
  /** Bookings counted in the numbers above. */
  counted: number;
  /**
   * Bookings we could NOT value, because no rate is recorded anywhere. The
   * totals are therefore understated, and every surface says so.
   */
  unknown: number;
  /** One sentence naming the gap, or empty when there isn't one. */
  caveat: string;
};

/**
 * Add it up, honestly. Written off is excluded from every total: it is not
 * income and it is not owed.
 */
export function summarise(
  trips: CommissionTrip[],
  suppliers: Map<string, CommissionSupplier>,
  now: Date
): CommissionSummary {
  const out: CommissionSummary = {
    received: 0,
    invoiced: 0,
    expected: 0,
    overdue: 0,
    turnover: 0,
    counted: 0,
    unknown: 0,
    caveat: "",
  };

  for (const trip of trips) {
    out.turnover += trip.totalValue ?? 0;
    if (trip.status === "written_off") continue;

    const supplier = trip.supplierId ? suppliers.get(trip.supplierId) ?? null : null;
    const value = commissionFor(trip, supplier);

    if (value.amount == null) {
      out.unknown++;
      continue;
    }
    out.counted++;

    if (trip.status === "received") out.received += value.amount;
    else if (trip.status === "invoiced") out.invoiced += value.amount;
    else out.expected += value.amount;

    if (trip.status !== "received" && ageingOf(trip, supplier, now).state === "overdue") {
      out.overdue += value.amount;
    }
  }

  out.received = round2(out.received);
  out.invoiced = round2(out.invoiced);
  out.expected = round2(out.expected);
  out.overdue = round2(out.overdue);
  out.turnover = round2(out.turnover);

  if (out.unknown > 0) {
    out.caveat = `${out.unknown} booking${out.unknown === 1 ? " has" : "s have"} no commission rate recorded, so the real figure is higher than this.`;
  }

  return out;
}

export type ChaseItem = {
  tripId: string;
  supplierName: string;
  amount: number;
  daysOverdue: number;
  reason: string;
};

/**
 * Commission the agency is owed and has waited too long for, worst first.
 * This is the list that turns into money — it is the one part of the feature
 * an owner will use every week.
 */
export function chaseList(
  trips: CommissionTrip[],
  suppliers: Map<string, CommissionSupplier>,
  now: Date
): ChaseItem[] {
  const out: ChaseItem[] = [];

  for (const trip of trips) {
    if (trip.status === "received" || trip.status === "written_off") continue;
    const supplier = trip.supplierId ? suppliers.get(trip.supplierId) ?? null : null;
    if (!supplier) continue; // nobody to chase

    const ageing = ageingOf(trip, supplier, now);
    if (ageing.state !== "overdue" || ageing.days == null) continue;

    const value = commissionFor(trip, supplier);
    if (value.amount == null || value.amount <= 0) continue;

    out.push({
      tripId: trip.id,
      supplierName: supplier.name,
      amount: value.amount,
      daysOverdue: ageing.days,
      reason:
        trip.status === "invoiced"
          ? `Invoiced to ${supplier.name} and ${ageing.days} days past their terms.`
          : `${supplier.name} owes this and it is ${ageing.days} days past their usual terms. It may not have been invoiced yet.`,
    });
  }

  return out.sort((a, b) => b.daysOverdue - a.daysOverdue);
}

/** £1,240 — the same shape the rest of the product uses. */
export function money(n: number): string {
  return `£${Math.round(n).toLocaleString("en-GB")}`;
}
