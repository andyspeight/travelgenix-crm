import { describe, expect, it } from "vitest";
import { titleCase, formatAddress } from "@/lib/address/postcode";

describe("titleCase", () => {
  it("tidies PAF's upper-cased names", () => {
    expect(titleCase("WEST YORKSHIRE")).toBe("West Yorkshire");
    expect(titleCase("london")).toBe("London");
    expect(titleCase("  surrey ")).toBe("Surrey");
  });
  it("is empty for nullish input", () => {
    expect(titleCase(null)).toBe("");
    expect(titleCase(undefined)).toBe("");
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
