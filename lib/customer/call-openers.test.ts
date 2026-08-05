import { describe, expect, it } from "vitest";
import {
  relativePhrase,
  lastTripSummary,
  nextTripSummary,
  birthdayOpener,
  rebookingOpener,
  loyaltyOpener,
  type TripLite,
} from "@/lib/customer/call-openers";

const NOW = new Date("2026-08-05T12:00:00.000Z");
const trip = (p: Partial<TripLite>): TripLite => ({ destination: null, depart_date: null, return_date: null, ...p });

describe("relativePhrase", () => {
  it("handles today / yesterday / tomorrow", () => {
    expect(relativePhrase("2026-08-05", NOW)).toBe("today");
    expect(relativePhrase("2026-08-04", NOW)).toBe("yesterday");
    expect(relativePhrase("2026-08-06", NOW)).toBe("tomorrow");
  });

  it("uses days, weeks, months and years", () => {
    expect(relativePhrase("2026-07-29", NOW)).toBe("7 days ago");
    expect(relativePhrase("2026-07-15", NOW)).toBe("3 weeks ago");
    expect(relativePhrase("2026-10-05", NOW)).toBe("in 2 months");
    expect(relativePhrase("2024-08-05", NOW)).toBe("2 years ago");
  });
});

describe("lastTripSummary", () => {
  it("picks the most recently returned trip", () => {
    const r = lastTripSummary(
      [
        trip({ destination: "Tenerife", return_date: "2026-07-15" }),
        trip({ destination: "Rome", return_date: "2025-05-01" }),
      ],
      NOW
    );
    expect(r).toEqual({ destination: "Tenerife", phrase: "3 weeks ago" });
  });

  it("falls back to country and to depart_date, and is null with nothing dated", () => {
    expect(lastTripSummary([trip({ destination_country: "Spain", depart_date: "2026-07-01" })], NOW)?.destination).toBe(
      "Spain"
    );
    expect(lastTripSummary([trip({ destination: "Nowhere" })], NOW)).toBeNull();
    expect(lastTripSummary([], NOW)).toBeNull();
  });
});

describe("nextTripSummary", () => {
  it("prefers the active trip and says 'there now'", () => {
    const r = nextTripSummary(trip({ destination: "Maldives", depart_date: "2026-08-01" }), [], NOW);
    expect(r).toEqual({ destination: "Maldives", active: true, phrase: "there now" });
  });

  it("otherwise takes the soonest upcoming with a departs-phrase", () => {
    const r = nextTripSummary(
      null,
      [
        trip({ destination: "Algarve", depart_date: "2026-09-16" }),
        trip({ destination: "Crete", depart_date: "2026-12-20" }),
      ],
      NOW
    );
    expect(r?.destination).toBe("Algarve");
    expect(r?.active).toBe(false);
    expect(r?.phrase).toBe("departs in 6 weeks");
  });

  it("is null when there's nothing to talk about", () => {
    expect(nextTripSummary(null, [], NOW)).toBeNull();
  });
});

describe("birthdayOpener", () => {
  it("surfaces an upcoming birthday with the age they turn", () => {
    const r = birthdayOpener([{ first_name: "Sarah", date_of_birth: "1990-08-15" }], NOW);
    expect(r).toEqual({ emoji: "🎂", text: "Sarah's birthday in 10 days (turning 36)" });
  });

  it("ignores birthdays more than a month out, and picks the soonest", () => {
    expect(birthdayOpener([{ first_name: "Jo", date_of_birth: "1990-12-01" }], NOW)).toBeNull();
    const r = birthdayOpener(
      [
        { first_name: "Far", date_of_birth: "1990-08-30" },
        { first_name: "Near", date_of_birth: "1985-08-06" },
      ],
      NOW
    );
    expect(r?.text.startsWith("Near's birthday tomorrow")).toBe(true);
  });
});

describe("rebookingOpener", () => {
  it("flags a trip that departed around now in an earlier year", () => {
    const r = rebookingOpener([{ destination: "Rhodes", destination_country: null, depart_date: "2025-08-01", return_date: null }], NOW);
    expect(r).toEqual({ emoji: "🔁", text: "This time last year: Rhodes — rebooking time?" });
  });

  it("ignores off-season and same-year trips", () => {
    expect(
      rebookingOpener([{ destination: "Rhodes", destination_country: null, depart_date: "2025-02-01", return_date: null }], NOW)
    ).toBeNull();
    expect(
      rebookingOpener([{ destination: "Rhodes", destination_country: null, depart_date: "2026-08-01", return_date: null }], NOW)
    ).toBeNull();
  });
});

describe("loyaltyOpener", () => {
  it("summarises a repeat customer", () => {
    expect(loyaltyOpener({ customer_since: "2019-03-01", trips_count: 7 })).toEqual({
      emoji: "⭐",
      text: "With you since 2019 · 7 trips",
    });
  });

  it("stays quiet for one-trip customers", () => {
    expect(loyaltyOpener({ customer_since: "2025-01-01", trips_count: 1 })).toBeNull();
  });
});
