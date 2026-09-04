import { describe, expect, it } from "vitest";
import { computeAccount, computeNextDue, reconcileSchedule, type TravelifyOrder } from "@/lib/travelify/balance";

const NOW = new Date("2026-09-03T12:00:00Z");

const order = (over: Partial<TravelifyOrder> = {}): TravelifyOrder => ({
  id: 1,
  status: "Confirmed",
  currency: "GBP",
  created: "2026-08-01",
  summary: { totalPrice: 4000 },
  voucher: null,
  paidToDate: 0,
  depositOption: null,
  documents: [],
  ...over,
});

const schedule = (): TravelifyOrder["depositOption"] => ({
  initialAmount: 500,
  currency: "GBP",
  breakdown: [
    { num: 1, amount: 1500, dueDate: "2026-09-20" },
    { num: 2, amount: 2000, dueDate: "2026-11-01" },
  ],
});

describe("computeAccount", () => {
  it("without a schedule, outstanding is the total less payments taken", () => {
    const a = computeAccount(order({ paidToDate: 1200 }), NOW);
    expect(a.outstanding).toBe(2800);
    expect(a.paid).toBe(1200);
    expect(a.next).toBeNull();
  });

  it("nets an order-level voucher off the total", () => {
    const a = computeAccount(order({ voucher: { code: "SUN", name: "Summer", value: -200 } }), NOW);
    expect(a.netTotal).toBe(3800);
    expect(a.outstanding).toBe(3800);
  });

  it("with a schedule, payments settle the earliest entries first", () => {
    const a = computeAccount(order({ depositOption: schedule(), paidToDate: 700 }), NOW);
    // 500 initial settled, 200 off instalment 1 -> 1300 + 2000 left.
    expect(a.schedule).toEqual([
      { amount: 1300, dueDate: "2026-09-20", isInitial: false },
      { amount: 2000, dueDate: "2026-11-01", isInitial: false },
    ]);
    expect(a.outstanding).toBe(3300);
    expect(a.next).toEqual({ amount: 1300, dueDate: "2026-09-20", remainingAmount: 2000, isInstalment: true });
  });

  it("an unpaid initial amount is due today", () => {
    const next = computeNextDue(order({ depositOption: schedule() }), NOW);
    expect(next?.amount).toBe(500);
    expect(next?.dueDate).toBe("2026-09-03");
  });

  it("an instalment whose date has passed is added to what is due now", () => {
    const next = computeNextDue(
      order({ depositOption: schedule(), paidToDate: 500 }),
      new Date("2026-09-25T09:00:00Z")
    );
    expect(next).toEqual({ amount: 1500, dueDate: "2026-09-25", remainingAmount: 2000, isInstalment: true });
  });

  it("a fully paid order owes nothing and has no next payment", () => {
    const a = computeAccount(order({ depositOption: schedule(), paidToDate: 4000 }), NOW);
    expect(reconcileSchedule(a as unknown as TravelifyOrder)).toEqual([]);
    expect(a.outstanding).toBe(0);
    expect(a.next).toBeNull();
  });

  it("falls back to the accommodation price when the summary has no total", () => {
    const a = computeAccount(
      order({
        summary: { totalPrice: 0 },
        items: [{ product: "Accommodation", price: 900, accommodation: { pricing: { price: 950 } } }],
      }),
      NOW
    );
    expect(a.total).toBe(950);
  });
});
