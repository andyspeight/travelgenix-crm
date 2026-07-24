import { describe, expect, it } from "vitest";
import { computeForecast, STAGE_WEIGHTS, type ForecastTrip, type ForecastQuote } from "@/lib/forecast/forecast";

const NOW = new Date("2026-07-24T12:00:00.000Z");

const trip = (over: Partial<ForecastTrip> = {}): ForecastTrip => ({
  id: `t-${Math.random()}`,
  stage: "quoted",
  destination: "Crete",
  total_value: 4000,
  depart_date: "2026-09-10",
  ...over,
});

describe("computeForecast — pipeline (booking-date view)", () => {
  it("weights each stage openly and totals both faces", () => {
    const trips = [
      trip({ id: "e1", stage: "enquiry", total_value: 2000 }),
      trip({ id: "q1", stage: "quoted", total_value: 4000 }),
      trip({ id: "qv", stage: "quoted", total_value: 10000 }),
    ];
    const quotes: ForecastQuote[] = [
      { trip_id: "qv", status: "viewed", view_count: 4, total_price: 10000 },
    ];
    const f = computeForecast(trips, quotes, NOW);

    const byLabel = Object.fromEntries(f.pipeline.lines.map((l) => [l.label, l]));
    expect(byLabel["Enquiries"].weighted).toBe(2000 * STAGE_WEIGHTS.enquiry);
    expect(byLabel["Quoted"].weighted).toBe(4000 * STAGE_WEIGHTS.quoted);
    expect(byLabel["Quoted · quote viewed"].weighted).toBe(10000 * STAGE_WEIGHTS.quoted_viewed);
    expect(f.pipeline.totalFace).toBe(16000);
    expect(f.pipeline.totalWeighted).toBe(Math.round(400 + 1800 + 6000));
  });

  it("a viewed live quote upgrades the trip's weight; unviewed does not", () => {
    const trips = [trip({ id: "a" }), trip({ id: "b" })];
    const quotes: ForecastQuote[] = [
      { trip_id: "a", status: "viewed", view_count: 2, total_price: 4000 },
      { trip_id: "b", status: "sent", view_count: 0, total_price: 4000 },
    ];
    const f = computeForecast(trips, quotes, NOW);
    const byLabel = Object.fromEntries(f.pipeline.lines.map((l) => [l.label, l]));
    expect(byLabel["Quoted · quote viewed"].count).toBe(1);
    expect(byLabel["Quoted"].count).toBe(1);
  });

  it("won and lost stages never appear in the pipeline", () => {
    const f = computeForecast(
      [trip({ stage: "booked" }), trip({ stage: "cancelled" }), trip({ stage: "returned" })],
      [],
      NOW
    );
    expect(f.pipeline.totalFace).toBe(0);
  });
});

describe("computeForecast — travel calendar (departure-date view)", () => {
  it("splits committed vs weighted potential by departure month", () => {
    const trips = [
      trip({ stage: "booked", depart_date: "2026-08-15", total_value: 6000 }),
      trip({ stage: "pre_departure", depart_date: "2026-08-20", total_value: 4000 }),
      trip({ stage: "quoted", depart_date: "2026-08-05", total_value: 2000 }), // 45% → 900
      trip({ stage: "enquiry", depart_date: "2026-10-01", total_value: 5000 }), // 20% → 1000
    ];
    const f = computeForecast(trips, [], NOW);

    const aug = f.months.find((m) => m.month === "2026-08")!;
    expect(aug.committed).toBe(10000);
    expect(aug.potential).toBe(900);

    const oct = f.months.find((m) => m.month === "2026-10")!;
    expect(oct.committed).toBe(0);
    expect(oct.potential).toBe(1000);
  });

  it("always returns the asked-for months, including empty ones, in order", () => {
    const f = computeForecast([], [], NOW, 6);
    expect(f.months).toHaveLength(6);
    expect(f.months[0].month).toBe("2026-07");
    expect(f.months[5].month).toBe("2026-12");
    expect(f.months.every((m) => m.committed === 0 && m.potential === 0)).toBe(true);
  });

  it("departures outside the horizon or without dates are simply not placed", () => {
    const f = computeForecast(
      [
        trip({ stage: "booked", depart_date: "2027-06-01", total_value: 9000 }),
        trip({ stage: "booked", depart_date: null, total_value: 9000 }),
      ],
      [],
      NOW
    );
    expect(f.months.every((m) => m.committed === 0)).toBe(true);
  });
});
