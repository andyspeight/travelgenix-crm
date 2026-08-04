import { describe, expect, it } from "vitest";
import {
  normalisePostcode,
  isValidUkPostcode,
  formatAddress,
  parsePostcodesIo,
  parseGetAddress,
} from "@/lib/address/postcode";

describe("normalisePostcode", () => {
  it("upper-cases and inserts the single inward-code space", () => {
    expect(normalisePostcode("sw1a1aa")).toBe("SW1A 1AA");
    expect(normalisePostcode("ls1 4dy")).toBe("LS1 4DY");
    expect(normalisePostcode("  m1  1ae ")).toBe("M1 1AE");
  });
  it("leaves too-short input alone but tidied", () => {
    expect(normalisePostcode("ls1")).toBe("LS1");
    expect(normalisePostcode("")).toBe("");
  });
});

describe("isValidUkPostcode", () => {
  it("accepts the real postcode shapes", () => {
    for (const p of ["SW1A 1AA", "M1 1AE", "B33 8TH", "CR2 6XH", "DN55 1PT", "ls14dy"]) {
      expect(isValidUkPostcode(p)).toBe(true);
    }
  });
  it("rejects junk", () => {
    for (const p of ["", "hello", "12345", "ZZ", "SW1A"]) {
      expect(isValidUkPostcode(p)).toBe(false);
    }
  });
});

describe("formatAddress", () => {
  it("joins the parts that are set and skips the blanks", () => {
    expect(
      formatAddress({
        address_line1: "10 Downing Street",
        address_line2: "",
        city: "London",
        county: null,
        postcode: "SW1A 2AA",
      })
    ).toBe("10 Downing Street, London, SW1A 2AA");
  });
  it("is empty when nothing is set", () => {
    expect(formatAddress({})).toBe("");
  });
});

describe("parsePostcodesIo (free provider — area only)", () => {
  it("maps admin_district to city and backfills county from region", () => {
    const json = {
      status: 200,
      result: { postcode: "LS1 4DY", admin_district: "Leeds", admin_county: null, region: "Yorkshire and The Humber", parish: null },
    };
    expect(parsePostcodesIo(json, "ls14dy")).toEqual({
      line1: "",
      line2: "",
      city: "Leeds",
      county: "Yorkshire and The Humber",
      postcode: "LS1 4DY",
    });
  });
  it("uses admin_county when present and doesn't duplicate it as region", () => {
    const json = { result: { postcode: "GU1 1AA", admin_district: "Guildford", admin_county: "Surrey", region: "South East" } };
    const out = parsePostcodesIo(json, "GU1 1AA");
    expect(out?.city).toBe("Guildford");
    expect(out?.county).toBe("Surrey");
  });
  it("returns null when there is no result", () => {
    expect(parsePostcodesIo({ status: 404, result: null }, "X")).toBeNull();
    expect(parsePostcodesIo(null, "X")).toBeNull();
  });
});

describe("parseGetAddress (keyed provider — full list)", () => {
  it("folds line_1..line_4 into line1/line2 and carries town + county", () => {
    const json = {
      postcode: "LS1 4DY",
      addresses: [
        { line_1: "Flat 1", line_2: "Bond House", line_3: "12 Bond Street", line_4: "", town_or_city: "Leeds", county: "West Yorkshire" },
        { line_1: "Flat 2", line_2: "Bond House", line_3: "12 Bond Street", line_4: "", town_or_city: "Leeds", county: "West Yorkshire" },
      ],
    };
    const out = parseGetAddress(json, "ls14dy");
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({
      line1: "Flat 1",
      line2: "Bond House, 12 Bond Street",
      city: "Leeds",
      county: "West Yorkshire",
      postcode: "LS1 4DY",
    });
  });
  it("returns an empty list when there are no addresses", () => {
    expect(parseGetAddress({ addresses: [] }, "X")).toEqual([]);
    expect(parseGetAddress({}, "X")).toEqual([]);
  });
});
