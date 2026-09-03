import { describe, expect, it } from "vitest";
import { compose, type PortalEmailArgs } from "@/lib/portal/emails";
import { safeNextPath } from "@/lib/portal/invite";

const base = {
  supabase: null as never,
  agencyId: "a",
  link: "https://crm.travelify.io/api/portal/auth?token=abc&next=%2Fportal%2Fquotes%2Fq1",
  toContactId: "c1",
  householdId: "h1",
  agencyName: "Sunshine Travel",
  firstName: "Sarah",
  destination: "Santorini, Greece",
  departDate: "2026-06-12",
  returnDate: "2026-06-19",
} satisfies Omit<PortalEmailArgs, "kind">;

describe("portal email copy", () => {
  it("names the trip, the dates and the price on a new quote", () => {
    const c = compose({ ...base, kind: "quote_ready", price: 4250, currency: "GBP" });
    expect(c.subject).toBe("Your quote for Santorini, Greece");
    expect(c.text).toContain("12–19 Jun 2026");
    expect(c.text).toContain("£4,250");
    expect(c.text).toContain(base.link);
  });

  it("nudges without pressure and offers a way out", () => {
    const c = compose({ ...base, kind: "quote_nudge" });
    expect(c.subject).toBe("Still thinking about Santorini, Greece?");
    expect(c.text).toContain("look again");
    expect(c.text).not.toMatch(/!|hurry|last chance/i);
  });

  it("confirms a booking and says what is on the page", () => {
    const c = compose({ ...base, kind: "trip_booked" });
    expect(c.subject).toBe("Santorini, Greece is confirmed");
    expect(c.text).toContain("documents");
  });

  it("copes with no name, no destination and no dates", () => {
    const c = compose({
      ...base,
      kind: "quote_ready",
      firstName: null,
      destination: null,
      departDate: null,
      returnDate: null,
    });
    expect(c.subject).toBe("Your quote for your trip");
    expect(c.text.startsWith("Hi,")).toBe(true);
  });

  it("escapes an agency name so it cannot inject markup", () => {
    const c = compose({ ...base, kind: "quote_ready", agencyName: 'Smith & "Co" <Travel>' });
    expect(c.html).toContain("Smith &amp; \"Co\" &lt;Travel&gt;");
    expect(c.html).not.toContain("<Travel>");
  });

  it("escapes the link in the href so a stray quote cannot break out", () => {
    const c = compose({ ...base, kind: "quote_ready", link: 'https://x.test/a?t=1"onmouseover=alert(1)' });
    expect(c.html).toContain("&quot;onmouseover");
    expect(c.html).not.toContain('"onmouseover=alert(1)"');
  });
});

describe("safeNextPath", () => {
  it("accepts portal paths only", () => {
    expect(safeNextPath("/portal")).toBe("/portal");
    expect(safeNextPath("/portal/quotes/1a-2b")).toBe("/portal/quotes/1a-2b");
  });

  it("refuses anything that could leave the portal or the site", () => {
    for (const bad of [
      "//evil.example",
      "/portal/../admin",
      "https://evil.example/portal",
      "/settings",
      "/portalx",
      "/portal/quotes/1?x=1",
      "",
      null,
    ]) {
      expect(safeNextPath(bad)).toBeNull();
    }
  });
});
