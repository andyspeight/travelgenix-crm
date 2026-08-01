import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { enrichEnquiry, type EnrichInput } from "@/lib/enrich/enquiry";

const NOW = new Date("2026-03-01T12:00:00.000Z");

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW); // the timing check reads Date.now()
});
afterEach(() => vi.useRealTimers());

const input = (over: Partial<EnrichInput> = {}): EnrichInput => ({
  destination: "Crete",
  departDate: "2026-08-01",
  returnDate: "2026-08-15",
  adults: 2,
  children: 2,
  travellers: [],
  ...over,
});

const find = (i: EnrichInput, kind: string) =>
  enrichEnquiry(i).find((f) => f.kind === kind);

describe("school holidays — the price band, known before anyone quotes", () => {
  it("spots dates inside the summer holidays", () => {
    const f = find(input(), "school_holiday")!;
    expect(f.headline).toMatch(/summer holidays/);
    expect(f.detail).toMatch(/peak pricing/);
  });

  it("tells a childless booking they could save by moving a few days", () => {
    const f = find(input({ children: 0 }), "school_holiday")!;
    expect(f.detail).toMatch(/moving a few days/);
  });

  it("raises school authorisation when children travel in term time", () => {
    const f = find(
      input({ departDate: "2026-06-10", returnDate: "2026-06-20" }),
      "school_holiday"
    )!;
    expect(f.headline).toMatch(/Term time/);
    expect(f.detail).toMatch(/authorisation/);
  });

  it("says nothing for a year the table does not cover, rather than implying term time", () => {
    expect(
      find(input({ departDate: "2031-08-01", returnDate: "2031-08-15" }), "school_holiday")
    ).toBeUndefined();
  });
});

describe("passports — flagging the risk, never giving the ruling", () => {
  const withPassport = (expiry: string, dest = "Crete") =>
    input({
      destination: dest,
      departDate: "2026-08-01",
      returnDate: "2026-08-15",
      travellers: [{ name: "Sam", passportExpiry: expiry }],
    });

  it("catches a passport that expires before they even get home", () => {
    const f = enrichEnquiry(withPassport("2026-08-10")).find((x) =>
      x.headline.includes("expires before they get home")
    )!;
    expect(f.tone).toBe("warn");
    expect(f.detail).toMatch(/renewing before anything is booked/);
  });

  it("warns when the margin is under the Schengen three months", () => {
    const f = enrichEnquiry(withPassport("2026-10-01")).find((x) =>
      x.headline.includes("too close to expiry")
    )!;
    expect(f.tone).toBe("warn");
    expect(f.detail).toMatch(/where 3 is usually required/);
    expect(f.source).toMatch(/Schengen/);
  });

  it("stays quiet when the margin is comfortable", () => {
    expect(
      enrichEnquiry(withPassport("2029-01-01")).find((x) =>
        x.headline.includes("too close")
      )
    ).toBeUndefined();
  });

  it("applies the six-month rule to a long-haul destination", () => {
    const f = enrichEnquiry(withPassport("2026-11-01", "Thailand")).find((x) =>
      x.headline.includes("too close to expiry")
    )!;
    expect(f.detail).toMatch(/where 6 is usually required/);
  });

  it("admits we do not hold issue dates, rather than implying the check is done", () => {
    const f = enrichEnquiry(withPassport("2029-01-01")).find((x) =>
      x.headline.includes("when their passports were issued")
    )!;
    expect(f.detail).toMatch(/10 years/);
    expect(f.detail).toMatch(/don't hold issue dates/);
  });

  it("says nothing at all for a destination we hold no rule for", () => {
    expect(
      enrichEnquiry(withPassport("2026-08-20", "Blackpool")).filter((x) => x.kind === "passport")
    ).toEqual([]);
  });

  it("quotes the rule it applied every time, so it can be verified", () => {
    for (const f of enrichEnquiry(withPassport("2026-10-01"))) {
      expect(f.source.length).toBeGreaterThan(10);
    }
  });
});

describe("lead time", () => {
  it("flags an imminent departure as something to act on now", () => {
    const f = find(
      input({ departDate: "2026-03-20", returnDate: "2026-03-27" }),
      "timing"
    )!;
    expect(f.tone).toBe("warn");
    expect(f.headline).toMatch(/in 19 days/);
  });

  it("ignores a departure comfortably far out", () => {
    expect(find(input(), "timing")).toBeUndefined();
  });
});

describe("ordering", () => {
  it("puts what needs acting on above what is merely interesting", () => {
    const facts = enrichEnquiry(
      input({
        departDate: "2026-03-20",
        returnDate: "2026-03-30",
        travellers: [{ name: "Sam", passportExpiry: "2026-04-01" }],
      })
    );
    expect(facts[0].tone).toBe("warn");
    const firstInfo = facts.findIndex((f) => f.tone === "info");
    const lastWarn = facts.map((f) => f.tone).lastIndexOf("warn");
    if (firstInfo !== -1) expect(lastWarn).toBeLessThan(firstInfo);
  });

  it("an enquiry with nothing notable produces nothing", () => {
    expect(
      enrichEnquiry({
        destination: "Blackpool",
        departDate: "2026-06-10",
        returnDate: "2026-06-17",
        adults: 2,
        children: 0,
        travellers: [],
      })
    ).toEqual([]);
  });
});
