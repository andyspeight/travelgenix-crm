import { describe, expect, it } from "vitest";
import { haversineMiles, nearestAirports } from "@/lib/airports/nearest";

// BH8 9ER (Bournemouth) — the example from the brief.
const BOURNEMOUTH = { lat: 50.7401, lng: -1.8631 };

describe("haversineMiles", () => {
  it("is ~0 for the same point", () => {
    expect(haversineMiles(BOURNEMOUTH, BOURNEMOUTH)).toBeCloseTo(0, 5);
  });

  it("matches a known distance (Heathrow → Gatwick ≈ 24 miles)", () => {
    const lhr = { lat: 51.47, lng: -0.4543 };
    const lgw = { lat: 51.1537, lng: -0.1821 };
    expect(haversineMiles(lhr, lgw)).toBeGreaterThan(20);
    expect(haversineMiles(lhr, lgw)).toBeLessThan(28);
  });

  it("is symmetric", () => {
    const a = { lat: 55.95, lng: -3.3725 };
    const b = { lat: 53.365, lng: -2.2727 };
    expect(haversineMiles(a, b)).toBeCloseTo(haversineMiles(b, a), 6);
  });
});

describe("nearestAirports", () => {
  it("puts Bournemouth first for a Bournemouth postcode, with Southampton next", () => {
    const near = nearestAirports(BOURNEMOUTH, 3);
    expect(near[0].iata).toBe("BOH");
    expect(near.map((a) => a.iata)).toContain("SOU");
    // Distances increase as we go down the list.
    expect(near[0].miles).toBeLessThanOrEqual(near[1].miles);
    expect(near[1].miles).toBeLessThanOrEqual(near[2].miles);
  });

  it("returns whole-mile distances and the requested count", () => {
    const near = nearestAirports(BOURNEMOUTH, 5);
    expect(near).toHaveLength(5);
    for (const a of near) expect(Number.isInteger(a.miles)).toBe(true);
  });

  it("finds London hubs closest to a central London point", () => {
    const london = { lat: 51.5074, lng: -0.1278 };
    const iatas = nearestAirports(london, 4).map((a) => a.iata);
    // City is the closest to the centre; the big hubs are all within reach.
    expect(iatas).toContain("LCY");
    expect(iatas.some((i) => ["LHR", "LGW", "STN", "LTN"].includes(i))).toBe(true);
  });

  it("clamps a silly count to an empty list rather than throwing", () => {
    expect(nearestAirports(BOURNEMOUTH, -3)).toEqual([]);
  });
});
