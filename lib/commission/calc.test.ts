import { describe, expect, it } from "vitest";
import {
  commissionFor,
  dueDateFor,
  ageingOf,
  summarise,
  chaseList,
  type CommissionTrip,
  type CommissionSupplier,
} from "@/lib/commission/calc";

const NOW = new Date("2026-08-01T12:00:00.000Z");

const trip = (over: Partial<CommissionTrip> = {}): CommissionTrip => ({
  id: "t1",
  totalValue: 4000,
  supplierId: "s1",
  commissionRate: null,
  commissionAmount: null,
  status: "expected",
  dueAt: null,
  receivedAt: null,
  departDate: "2026-06-01",
  returnDate: "2026-06-14",
  ...over,
});

const supplier = (over: Partial<CommissionSupplier> = {}): CommissionSupplier => ({
  id: "s1",
  name: "Jet2 Holidays",
  defaultCommissionRate: 10,
  paymentTermsDays: 30,
  ...over,
});

const suppliers = (s = supplier()) => new Map([[s.id, s]]);

describe("what we earn, and how we know", () => {
  it("trusts a typed amount above everything", () => {
    const v = commissionFor(trip({ commissionAmount: 512.5, commissionRate: 10 }), supplier());
    expect(v.amount).toBe(512.5);
    expect(v.source).toBe("amount");
  });

  it("uses the rate on the booking before the supplier's usual one", () => {
    const v = commissionFor(trip({ commissionRate: 12 }), supplier({ defaultCommissionRate: 10 }));
    expect(v.amount).toBe(480);
    expect(v.source).toBe("trip_rate");
  });

  it("falls back to the supplier's usual rate and says it is not confirmed", () => {
    const v = commissionFor(trip(), supplier());
    expect(v.amount).toBe(400);
    expect(v.source).toBe("supplier_rate");
    expect(v.reason).toMatch(/not confirmed on this booking/);
  });

  it("NEVER invents a rate when none is recorded anywhere", () => {
    const v = commissionFor(trip(), supplier({ defaultCommissionRate: null }));
    expect(v.amount).toBeNull();
    expect(v.source).toBe("unknown");
    expect(v.reason).toMatch(/No commission rate recorded/);
  });

  it("refuses to apply a rate to a booking with no price", () => {
    const v = commissionFor(trip({ totalValue: null, commissionRate: 10 }), supplier());
    expect(v.amount).toBeNull();
    expect(v.reason).toMatch(/no price on it yet/);
  });

  it("explains itself every time, in words an owner would use", () => {
    expect(commissionFor(trip({ commissionRate: 10 }), supplier()).reason).toBe(
      "10% of £4,000, the rate recorded on this booking."
    );
  });
});

describe("when the supplier owes it", () => {
  it("counts the terms from the return date", () => {
    expect(dueDateFor(trip(), supplier()).date).toBe("2026-07-14");
  });

  it("uses departure when there is no return date", () => {
    expect(dueDateFor(trip({ returnDate: null }), supplier()).date).toBe("2026-07-01");
  });

  it("prefers a date set by hand", () => {
    const d = dueDateFor(trip({ dueAt: "2026-09-30" }), supplier());
    expect(d.date).toBe("2026-09-30");
    expect(d.reason).toMatch(/Set on this booking/);
  });

  it("says there is nothing to chase against rather than making a date up", () => {
    const d = dueDateFor(trip(), supplier({ paymentTermsDays: null }));
    expect(d.date).toBeNull();
    expect(d.reason).toMatch(/No payment terms recorded/);
  });
});

describe("where it stands today", () => {
  it("calls paid money paid", () => {
    expect(ageingOf(trip({ status: "received" }), supplier(), NOW).state).toBe("received");
  });

  it("counts the days a supplier is late", () => {
    const a = ageingOf(trip(), supplier(), NOW); // due 14 Jul, now 1 Aug
    expect(a.state).toBe("overdue");
    expect(a.days).toBe(18);
    expect(a.label).toBe("18 days overdue");
  });

  it("does not call something due today late", () => {
    const a = ageingOf(trip({ dueAt: "2026-08-01" }), supplier(), NOW);
    expect(a.state).toBe("due_soon");
    expect(a.label).toBe("Due today");
  });

  it("does not shout about something not due yet", () => {
    const a = ageingOf(trip({ departDate: "2026-12-01", returnDate: "2026-12-14" }), supplier(), NOW);
    expect(a.state).toBe("not_due");
  });

  it("admits when it cannot tell", () => {
    expect(ageingOf(trip(), supplier({ paymentTermsDays: null }), NOW).state).toBe("unknown");
  });
});

describe("the summary an owner reads", () => {
  it("keeps received, invoiced and expected as three different numbers", () => {
    const s = summarise(
      [
        trip({ id: "a", status: "received", commissionAmount: 300 }),
        trip({ id: "b", status: "invoiced", commissionAmount: 200 }),
        trip({ id: "c", status: "expected", commissionAmount: 100 }),
      ],
      suppliers(),
      NOW
    );
    expect(s.received).toBe(300);
    expect(s.invoiced).toBe(200);
    expect(s.expected).toBe(100);
  });

  it("says out loud how many bookings it could not value", () => {
    const s = summarise(
      [trip({ id: "a", commissionAmount: 400 }), trip({ id: "b", supplierId: null })],
      suppliers(),
      NOW
    );
    expect(s.counted).toBe(1);
    expect(s.unknown).toBe(1);
    expect(s.caveat).toMatch(/no commission rate recorded/);
    expect(s.caveat).toMatch(/higher than this/);
  });

  it("has no caveat when there is nothing missing", () => {
    expect(summarise([trip({ commissionAmount: 400 })], suppliers(), NOW).caveat).toBe("");
  });

  it("leaves written-off commission out of every total", () => {
    const s = summarise([trip({ status: "written_off", commissionAmount: 400 })], suppliers(), NOW);
    expect(s.received + s.invoiced + s.expected + s.overdue).toBe(0);
    expect(s.unknown).toBe(0);
  });

  it("shows turnover separately, because it is the customer's money", () => {
    const s = summarise([trip({ commissionAmount: 400 })], suppliers(), NOW);
    expect(s.turnover).toBe(4000);
    expect(s.expected).toBe(400);
  });

  it("counts the overdue money as its own figure", () => {
    const s = summarise([trip({ commissionAmount: 400 })], suppliers(), NOW);
    expect(s.overdue).toBe(400);
  });
});

describe("the chase list, which is the part that turns into money", () => {
  it("puts the longest wait first", () => {
    const list = chaseList(
      [
        trip({ id: "recent", commissionAmount: 100, returnDate: "2026-06-25" }),
        trip({ id: "ancient", commissionAmount: 900, returnDate: "2026-04-01" }),
      ],
      suppliers(),
      NOW
    );
    expect(list[0].tripId).toBe("ancient");
    expect(list[0].amount).toBe(900);
  });

  it("words an uninvoiced one differently, because that is the agency's fault", () => {
    const [item] = chaseList([trip({ commissionAmount: 400 })], suppliers(), NOW);
    expect(item.reason).toMatch(/may not have been invoiced yet/);
  });

  it("leaves out anything already paid", () => {
    expect(chaseList([trip({ status: "received", commissionAmount: 400 })], suppliers(), NOW)).toEqual([]);
  });

  it("leaves out a booking with nobody to chase", () => {
    expect(chaseList([trip({ supplierId: null, commissionAmount: 400 })], suppliers(), NOW)).toEqual([]);
  });

  it("leaves out anything it cannot put a number on", () => {
    expect(
      chaseList([trip()], suppliers(supplier({ defaultCommissionRate: null })), NOW)
    ).toEqual([]);
  });
});
