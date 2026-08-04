import { describe, expect, it } from "vitest";
import { scanPassports, summarisePassports, type PassportContact, type PassportTrip } from "@/lib/passports/status";

const NOW = new Date("2026-08-04T00:00:00.000Z");

const c = (over: Partial<PassportContact> & { id: string; household_id: string }): PassportContact => ({
  first_name: "Test",
  last_name: "Traveller",
  passport_expiry: null,
  ...over,
});

const trip = (over: Partial<PassportTrip> & { household_id: string }): PassportTrip => ({
  destination: "Crete",
  depart_date: "2026-09-01",
  stage: "pre_departure",
  ...over,
});

describe("scanPassports", () => {
  it("flags an already-expired passport regardless of trips", () => {
    const out = scanPassports([c({ id: "1", household_id: "h1", passport_expiry: "2025-01-01" })], [], NOW);
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe("expired");
    expect(out[0].severity).toBe("warning");
  });

  it("flags a passport that expires before an upcoming trip", () => {
    const out = scanPassports(
      [c({ id: "1", household_id: "h1", passport_expiry: "2026-08-20" })],
      [trip({ household_id: "h1", depart_date: "2026-09-01", destination: "Rhodes" })],
      NOW
    );
    expect(out[0].kind).toBe("insufficient_for_trip");
    expect(out[0].detail).toContain("Rhodes");
  });

  it("flags under-six-months validity against a trip", () => {
    // Departs in ~1 month, passport valid until ~4 months out → margin < 6mo.
    const out = scanPassports(
      [c({ id: "1", household_id: "h1", passport_expiry: "2026-12-01" })],
      [trip({ household_id: "h1", depart_date: "2026-09-01" })],
      NOW
    );
    expect(out[0].kind).toBe("insufficient_for_trip");
  });

  it("flags expiring-soon when there's no trip context", () => {
    const out = scanPassports([c({ id: "1", household_id: "h1", passport_expiry: "2026-10-15" })], [], NOW);
    expect(out[0].kind).toBe("expiring_soon");
  });

  it("flags a missing passport only when a trip is coming up", () => {
    const withTrip = scanPassports([c({ id: "1", household_id: "h1", passport_expiry: null })], [trip({ household_id: "h1" })], NOW);
    expect(withTrip[0].kind).toBe("missing");
    const noTrip = scanPassports([c({ id: "1", household_id: "h1", passport_expiry: null })], [], NOW);
    expect(noTrip).toHaveLength(0);
  });

  it("says nothing about a healthy passport with plenty of validity", () => {
    const out = scanPassports([c({ id: "1", household_id: "h1", passport_expiry: "2030-01-01" })], [trip({ household_id: "h1" })], NOW);
    expect(out).toHaveLength(0);
  });

  it("ignores cancelled and returned trips for the trip-margin check", () => {
    const out = scanPassports(
      [c({ id: "1", household_id: "h1", passport_expiry: "2026-10-01" })],
      [trip({ household_id: "h1", depart_date: "2026-09-15", stage: "cancelled" })],
      NOW
    );
    // No live trip → falls back to expiring-soon, not insufficient_for_trip.
    expect(out[0].kind).toBe("expiring_soon");
  });

  it("orders warnings before info", () => {
    const out = scanPassports(
      [
        c({ id: "info", household_id: "h1", passport_expiry: "2026-12-20" }), // ~4.5mo, no trip → info
        c({ id: "warn", household_id: "h2", passport_expiry: "2024-01-01" }), // expired → warning
      ],
      [],
      NOW
    );
    expect(out[0].contactId).toBe("warn");
  });
});

describe("summarisePassports", () => {
  it("is reassuring when clean", () => {
    expect(summarisePassports([])).toBe("No passport issues found.");
  });
  it("counts by kind", () => {
    const out = scanPassports(
      [
        c({ id: "1", household_id: "h1", passport_expiry: "2024-01-01" }),
        c({ id: "2", household_id: "h2", passport_expiry: "2026-10-10" }),
      ],
      [],
      NOW
    );
    expect(summarisePassports(out)).toMatch(/2 travellers with passport issues/);
  });
});
