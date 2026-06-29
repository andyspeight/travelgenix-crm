import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { computeOpportunity, computeRisk } from "@/lib/scoring/customer";
import { makeContact, makeHousehold, makeTrip, isoDaysFrom } from "@/lib/test/fixtures";

// computeRisk/computeOpportunity lean on the real `daysUntil`, which reads the
// system clock. Pin "today" so margin maths is deterministic across machines.
const NOW = new Date("2026-06-28T12:00:00.000Z");

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
});

describe("computeRisk", () => {
  it("is Low with no flags when passports clear a future trip comfortably", () => {
    const trips = [makeTrip({ stage: "booked", depart_date: isoDaysFrom(NOW, 30) })];
    const contacts = [
      makeContact({ passport_expiry: isoDaysFrom(NOW, 800), gdpr_consent: true }),
    ];
    const r = computeRisk(contacts, trips);
    expect(r.level).toBe("Low");
    expect(r.flags).toHaveLength(0);
    expect(r.fill).toBeLessThan(20);
  });

  it("is High when a passport expires before a planned departure", () => {
    // Departs in 60 days, passport expires in 30 → margin negative.
    const trips = [makeTrip({ stage: "booked", depart_date: isoDaysFrom(NOW, 60) })];
    const contacts = [
      makeContact({ first_name: "Jane", passport_expiry: isoDaysFrom(NOW, 30) }),
    ];
    const r = computeRisk(contacts, trips);
    expect(r.level).toBe("High");
    expect(r.flags.some((f) => /expires before/i.test(f))).toBe(true);
  });

  it("is Medium when passport margin is under six months", () => {
    // Departs in 30 days, passport expires in 120 → margin 90 (< 183).
    const trips = [makeTrip({ stage: "booked", depart_date: isoDaysFrom(NOW, 30) })];
    const contacts = [makeContact({ passport_expiry: isoDaysFrom(NOW, 120) })];
    const r = computeRisk(contacts, trips);
    expect(r.level).toBe("Medium");
    expect(r.flags.some((f) => /under 6 months margin/i.test(f))).toBe(true);
  });

  it("flags missing passports only when there is a future trip", () => {
    const noTrip = computeRisk([makeContact({ passport_expiry: null })], []);
    expect(noTrip.flags.some((f) => /no passport/i.test(f))).toBe(false);

    const withTrip = computeRisk(
      [makeContact({ passport_expiry: null })],
      [makeTrip({ stage: "booked", depart_date: isoDaysFrom(NOW, 40) })]
    );
    expect(withTrip.level).toBe("Medium");
    expect(withTrip.flags.some((f) => /no passport/i.test(f))).toBe(true);
  });

  it("ignores cancelled and returned trips for passport risk", () => {
    const trips = [
      makeTrip({ stage: "cancelled", depart_date: isoDaysFrom(NOW, 10) }),
      makeTrip({ stage: "returned", depart_date: isoDaysFrom(NOW, 10) }),
    ];
    // Passport already expired, but no live future trip → no passport flag.
    const contacts = [makeContact({ passport_expiry: isoDaysFrom(NOW, -5) })];
    const r = computeRisk(contacts, trips);
    expect(r.flags.some((f) => /passport/i.test(f))).toBe(false);
  });

  it("flags a household with no GDPR consent at all", () => {
    const r = computeRisk([makeContact({ gdpr_consent: false })], []);
    expect(r.flags.some((f) => /GDPR consent/i.test(f))).toBe(true);
    expect(r.level).toBe("Medium");
  });

  it("surfaces contact flags verbatim", () => {
    const r = computeRisk(
      [makeContact({ first_name: "Tom", flags: ["complaint 2024"] })],
      []
    );
    expect(r.flags).toContain("Tom: complaint 2024");
  });
});

describe("computeOpportunity", () => {
  it("returns null confidence with fewer than three real bookings", () => {
    const trips = [
      makeTrip({ id: "t1", stage: "booked", depart_date: isoDaysFrom(NOW, -400) }),
      makeTrip({ id: "t2", stage: "returned", depart_date: isoDaysFrom(NOW, -100) }),
    ];
    const o = computeOpportunity(makeHousehold(), trips);
    expect(o.confidence).toBeNull();
    expect(o.reason).toMatch(/insufficient history/i);
  });

  it("excludes enquiries and cancellations from the booking count", () => {
    const trips = [
      makeTrip({ id: "t1", stage: "enquiry", depart_date: isoDaysFrom(NOW, -300) }),
      makeTrip({ id: "t2", stage: "cancelled", depart_date: isoDaysFrom(NOW, -200) }),
      makeTrip({ id: "t3", stage: "returned", depart_date: isoDaysFrom(NOW, -100) }),
    ];
    // Only one real booking remains → still insufficient.
    expect(computeOpportunity(makeHousehold(), trips).confidence).toBeNull();
  });

  it("gives a strong signal when a regular booker is in their window", () => {
    // Three returned trips ~12 months apart; last ~12 months ago → due now.
    const trips = [
      makeTrip({ id: "t1", stage: "returned", depart_date: isoDaysFrom(NOW, -730) }),
      makeTrip({ id: "t2", stage: "returned", depart_date: isoDaysFrom(NOW, -365) }),
      makeTrip({ id: "t3", stage: "returned", depart_date: isoDaysFrom(NOW, -360) }),
    ];
    const household = makeHousehold({
      last_booking_at: isoDaysFrom(NOW, -360),
      lifetime_value: 30000,
      tags: ["VIP"],
    });
    const o = computeOpportunity(household, trips);
    expect(o.confidence).not.toBeNull();
    expect(o.confidence!).toBeGreaterThanOrEqual(65);
    expect(o.title).toMatch(/strong/i);
  });

  it("clamps confidence into the 20–95 band", () => {
    const trips = [
      makeTrip({ id: "t1", stage: "returned", depart_date: isoDaysFrom(NOW, -3650) }),
      makeTrip({ id: "t2", stage: "returned", depart_date: isoDaysFrom(NOW, -3000) }),
      makeTrip({ id: "t3", stage: "returned", depart_date: isoDaysFrom(NOW, -2500) }),
    ];
    // Very long lapsed → score pushed down, but never below the floor.
    const o = computeOpportunity(
      makeHousehold({ last_booking_at: isoDaysFrom(NOW, -2500) }),
      trips
    );
    expect(o.confidence!).toBeGreaterThanOrEqual(20);
    expect(o.confidence!).toBeLessThanOrEqual(95);
  });
});
