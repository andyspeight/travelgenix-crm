import { describe, expect, it } from "vitest";
import { parseQueryToTokens, SAVED_SEGMENTS } from "@/lib/segmentation/parse";

describe("parseQueryToTokens — destinations", () => {
  it("extracts a known destination, case-insensitively and title-cased", () => {
    const tokens = parseQueryToTokens("families who went to GREECE");
    const dest = tokens.find((t) => t.type === "destination");
    expect(dest?.label).toBe("Greece");
    expect(dest?.filter).toEqual({ kind: "destination", match: "greece" });
  });

  it("only emits the first destination match", () => {
    const tokens = parseQueryToTokens("greece or italy lovers");
    expect(tokens.filter((t) => t.type === "destination")).toHaveLength(1);
  });
});

describe("parseQueryToTokens — time", () => {
  it("captures a four-digit year", () => {
    const t = parseQueryToTokens("booked in 2024");
    expect(t.find((x) => x.type === "time")?.filter).toEqual({
      kind: "booked_year",
      year: 2024,
    });
  });

  it("recognises dormant-customer phrasing", () => {
    const t = parseQueryToTokens("customers who have gone quiet");
    expect(t.find((x) => x.type === "time")?.filter).toEqual({
      kind: "no_contact_months",
      months: 12,
    });
  });

  it("parses an explicit 'last N months' window", () => {
    const t = parseQueryToTokens("anyone who booked in the last 6 months");
    expect(t.some((x) => x.filter.kind === "booked_in_last_months" && x.filter.months === 6)).toBe(
      true
    );
  });
});

describe("parseQueryToTokens — household", () => {
  it("maps a kids/children mention to a family household when none stated", () => {
    const t = parseQueryToTokens("clients travelling with kids");
    const h = t.find((x) => x.type === "household");
    expect(h?.filter).toEqual({ kind: "household_type", value: "family" });
  });

  it("does not double-count household when 'family' is explicit", () => {
    const t = parseQueryToTokens("a family with children");
    expect(t.filter((x) => x.type === "household")).toHaveLength(1);
  });

  it("detects couples and solo travellers", () => {
    expect(parseQueryToTokens("couples only").find((x) => x.type === "household")?.filter).toEqual({
      kind: "household_type",
      value: "couple",
    });
    expect(parseQueryToTokens("solo travellers").find((x) => x.type === "household")?.filter).toEqual(
      { kind: "household_type", value: "solo" }
    );
  });
});

describe("parseQueryToTokens — value bands", () => {
  it("reads an explicit '£20k' threshold and scales to pounds", () => {
    const t = parseQueryToTokens("customers worth over £20k");
    expect(t.find((x) => x.type === "value")?.filter).toEqual({ kind: "ltv_min", amount: 20000 });
  });

  it("treats a small bare number as thousands", () => {
    const t = parseQueryToTokens("spend over 15");
    expect(t.find((x) => x.type === "value")?.filter).toEqual({ kind: "ltv_min", amount: 15000 });
  });

  it("falls back to a default high-value band on a VIP phrase", () => {
    const t = parseQueryToTokens("our big spenders");
    expect(t.find((x) => x.type === "value")?.filter).toEqual({ kind: "ltv_min", amount: 25000 });
  });
});

describe("parseQueryToTokens — status and location", () => {
  it("detects travelling-now status", () => {
    const t = parseQueryToTokens("who is currently away");
    expect(t.find((x) => x.type === "status")?.filter).toEqual({
      kind: "trip_stage",
      value: "travelling",
    });
  });

  it("detects a known local city", () => {
    const t = parseQueryToTokens("families in Bournemouth");
    expect(t.find((x) => x.type === "location")?.filter).toEqual({
      kind: "city",
      match: "bournemouth",
    });
  });
});

describe("parseQueryToTokens — combinations", () => {
  it("combines destination, value and dormancy into distinct tokens", () => {
    const t = parseQueryToTokens("high value greece families who have gone quiet");
    expect(t.map((x) => x.type).sort()).toEqual(["destination", "household", "time", "value"]);
  });

  it("returns no tokens for an unrecognised query", () => {
    expect(parseQueryToTokens("hello there")).toHaveLength(0);
  });
});

describe("SAVED_SEGMENTS", () => {
  it("are well-formed with unique ids and at least one token each", () => {
    const ids = SAVED_SEGMENTS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const seg of SAVED_SEGMENTS) {
      expect(seg.tokens.length).toBeGreaterThan(0);
      expect(seg.label.length).toBeGreaterThan(0);
    }
  });
});
