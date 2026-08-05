import { describe, expect, it } from "vitest";
import { buildMatrixBody, parseMatrix } from "@/lib/geo/road-matrix";

const SOURCE = { lat: 50.74, lng: -1.86 };
const DESTS = [
  { lat: 50.78, lng: -1.8425 }, // Bournemouth
  { lat: 50.9503, lng: -1.3568 }, // Southampton
];

describe("buildMatrixBody", () => {
  it("puts the source first and lists destinations as [lng, lat]", () => {
    const body = buildMatrixBody(SOURCE, DESTS);
    expect(body.locations[0]).toEqual([-1.86, 50.74]);
    expect(body.locations).toHaveLength(3);
    expect(body.sources).toEqual([0]);
    expect(body.destinations).toEqual([1, 2]);
    expect(body.units).toBe("mi");
    expect(body.metrics).toContain("distance");
    expect(body.metrics).toContain("duration");
  });
});

describe("parseMatrix", () => {
  it("returns miles (rounded) and minutes (from seconds) per destination", () => {
    const json = { distances: [[8.4, 24.6]], durations: [[900, 2100]] };
    expect(parseMatrix(json, 2)).toEqual([
      { miles: 8, minutes: 15 },
      { miles: 25, minutes: 35 },
    ]);
  });

  it("yields nulls for an unroutable pair (e.g. across water)", () => {
    const json = { distances: [[12, null]], durations: [[600, null]] };
    expect(parseMatrix(json, 2)).toEqual([
      { miles: 12, minutes: 10 },
      { miles: null, minutes: null },
    ]);
  });

  it("is null-safe when the response is empty or malformed", () => {
    expect(parseMatrix({}, 2)).toEqual([
      { miles: null, minutes: null },
      { miles: null, minutes: null },
    ]);
    expect(parseMatrix(null, 1)).toEqual([{ miles: null, minutes: null }]);
  });
});
