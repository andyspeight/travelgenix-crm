import { describe, expect, it } from "vitest";
import { computeRollups } from "@/lib/customer/rollups";
import { makeTrip, isoDaysFrom } from "@/lib/test/fixtures";

const NOW = new Date("2026-06-29T12:00:00.000Z");

describe("computeRollups", () => {
  it("sums value and counts only real bookings (not enquiries/quotes/cancels)", () => {
    const r = computeRollups(
      [
        makeTrip({ stage: "booked", total_value: 5000 }),
        makeTrip({ stage: "returned", total_value: 3000 }),
        makeTrip({ stage: "travelling", total_value: 2000 }),
        makeTrip({ stage: "enquiry", total_value: 9999 }),
        makeTrip({ stage: "quoted", total_value: 8888 }),
        makeTrip({ stage: "cancelled", total_value: 7777 }),
      ],
      NOW
    );
    expect(r.lifetime_value).toBe(10000);
    expect(r.trips_count).toBe(3);
  });

  it("picks the soonest future departure among live stages only", () => {
    const r = computeRollups(
      [
        makeTrip({ stage: "booked", depart_date: isoDaysFrom(NOW, 30) }),
        makeTrip({ stage: "pre_departure", depart_date: isoDaysFrom(NOW, 5) }),
        makeTrip({ stage: "returned", depart_date: isoDaysFrom(NOW, 2) }), // past-life stage, ignored
        makeTrip({ stage: "quoted", depart_date: isoDaysFrom(NOW, 1) }), // not booked, ignored
      ],
      NOW
    );
    expect(r.next_departure).toBe(isoDaysFrom(NOW, 5));
  });

  it("ignores departures already in the past and handles no upcoming trips", () => {
    const past = computeRollups(
      [makeTrip({ stage: "booked", depart_date: isoDaysFrom(NOW, -3) })],
      NOW
    );
    expect(past.next_departure).toBeNull();

    const none = computeRollups([], NOW);
    expect(none).toEqual({ lifetime_value: 0, trips_count: 0, next_departure: null });
  });

  it("treats null values as zero rather than NaN", () => {
    const r = computeRollups([makeTrip({ stage: "booked", total_value: null })], NOW);
    expect(r.lifetime_value).toBe(0);
    expect(r.trips_count).toBe(1);
  });
});
