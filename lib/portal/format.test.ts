import { describe, expect, it } from "vitest";
import { formatMoney, quoteState, quoteStatus } from "@/lib/portal/format";

const NOW = new Date("2026-09-03T12:00:00Z");

describe("quoteState", () => {
  it("a sent quote with time left is open", () => {
    expect(quoteState({ status: "sent", expiresAt: "2026-09-10T23:59:59Z" }, NOW)).toBe("open");
    expect(quoteState({ status: "viewed", expiresAt: null }, NOW)).toBe("open");
  });

  it("a lapsed expiry counts as expired before the nightly job marks the row", () => {
    expect(quoteState({ status: "sent", expiresAt: "2026-09-01T23:59:59Z" }, NOW)).toBe("expired");
    expect(quoteState({ status: "viewed", expiresAt: "2026-09-03T11:59:59Z" }, NOW)).toBe("expired");
    expect(quoteState({ status: "expired", expiresAt: null }, NOW)).toBe("expired");
  });

  it("decided quotes keep their decision", () => {
    expect(quoteState({ status: "accepted", expiresAt: "2026-01-01T00:00:00Z" }, NOW)).toBe("accepted");
    expect(quoteState({ status: "declined", expiresAt: null }, NOW)).toBe("declined");
  });

  it("drafts and superseded versions are not the customer's to act on", () => {
    expect(quoteState({ status: "draft", expiresAt: null }, NOW)).toBe("unavailable");
    expect(quoteState({ status: "superseded", expiresAt: null }, NOW)).toBe("unavailable");
  });

  it("only the open state offers a decision label", () => {
    expect(quoteStatus("open").badge).toBe("decide");
    expect(quoteStatus("expired").label).toBe("Expired");
    expect(quoteStatus("unavailable").badge).toBe("off");
  });
});

describe("formatMoney", () => {
  it("formats whole pounds with the symbol and grouping", () => {
    expect(formatMoney(4250)).toBe("£4,250");
    expect(formatMoney(4250.6, "GBP")).toBe("£4,251");
  });
  it("handles other currencies and missing values", () => {
    expect(formatMoney(1200, "EUR")).toBe("€1,200");
    expect(formatMoney(null)).toBe("");
  });
});
