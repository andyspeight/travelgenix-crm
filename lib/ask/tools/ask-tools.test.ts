import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { customerProfile } from "@/lib/ask/tools/customer-profile";
import { businessReport } from "@/lib/ask/tools/business-report";
import { customersGoneQuiet } from "@/lib/ask/tools/customers-gone-quiet";
import { TOOLS, findTool } from "@/lib/ask/registry";
import { fakeDb } from "@/lib/test/fake-db";
import { makeContact, makeHousehold, makeTrip, isoDaysFrom } from "@/lib/test/fixtures";
import type { QueryContext } from "@/lib/ask/contract";

const NOW = new Date("2026-06-29T12:00:00.000Z");

// customer-profile leans on computeRisk, which reads the real clock — pin it
// to ctx.now so date arithmetic in signals and risk agree.
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
});

function ctx(db: ReturnType<typeof fakeDb>): QueryContext {
  return { agencyId: "a1", db, now: NOW };
}

describe("registry", () => {
  it("exposes the full toolset with unique names", () => {
    const names = TOOLS.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
    for (const wanted of ["customer_profile", "business_report", "customers_gone_quiet"]) {
      expect(findTool(wanted)?.name).toBe(wanted);
    }
  });
});

describe("customer_profile", () => {
  it("returns empty when nobody matches", async () => {
    const db = fakeDb({ households: [] });
    const r = await customerProfile.run({ name: "Nobody" }, ctx(db));
    expect(r.shape).toBe("empty");
    expect(r.summary).toMatch(/no customer or traveller matching/i);
  });

  it("lists candidates when several match, without profiling any", async () => {
    const db = fakeDb({
      households: [
        makeHousehold({ id: "h1", display_name: "Smith Family" }),
        makeHousehold({ id: "h2", display_name: "Smithson Household" }),
      ],
    });
    const r = await customerProfile.run({ name: "Smith" }, ctx(db));
    expect(r.shape).toBe("list");
    expect(r.rows).toHaveLength(2);
    expect(r.actionable).toBe(false);
    expect(r.summary).toMatch(/2 customers match/i);
  });

  it("builds a full profile for a single match with grounded signals", async () => {
    const hh = makeHousehold({
      id: "h1",
      display_name: "Sarah & James Thompson",
      household_type: "family",
      city: "Poole",
      lifetime_value: 38000,
      trips_count: 7,
      tags: ["VIP"],
      customer_since: "2019-03-01",
    });
    const db = fakeDb({
      households: [hh],
      contacts: [makeContact({ passport_expiry: isoDaysFrom(NOW, 800) })],
      trips: [
        makeTrip({ id: "t-up", stage: "booked", destination: "Maldives", depart_date: isoDaysFrom(NOW, 5), total_value: 22000 }),
        makeTrip({ id: "t-past", stage: "returned", destination: "Crete", depart_date: isoDaysFrom(NOW, -300) }),
        makeTrip({ id: "t-open", stage: "quoted", destination: "Sardinia", depart_date: null }),
      ],
    });

    const r = await customerProfile.run({ name: "the Thompson family" }, ctx(db));
    expect(r.shape).toBe("list");
    // Household row first, linking to the record.
    expect(r.rows?.[0]).toMatchObject({ id: "h1", href: "/customers/h1", title: "Sarah & James Thompson" });
    expect(r.rows?.[0].badges).toContain("VIP");
    // Upcoming + last trip rows present.
    const titles = (r.rows ?? []).map((x) => x.title).join(" | ");
    expect(titles).toMatch(/Upcoming: Maldives/);
    expect(titles).toMatch(/Last trip: Crete/);
    // Signals: imminent departure, open pipeline, VIP — all deterministic.
    const kinds = r.signals.map((s) => s.kind);
    expect(kinds).toContain("imminent_departure");
    expect(kinds).toContain("open_pipeline");
    expect(kinds).toContain("vip");
    expect(r.summary).toMatch(/£38k over 7 trips/);
  });
});

describe("business_report", () => {
  it("summarises a period with revenue, pipeline, new customers and top destination", async () => {
    const db = fakeDb({
      trips: [
        // First query: trips departing in period.
        [
          makeTrip({ id: "b1", stage: "booked", destination: "Greece", total_value: 10000, depart_date: "2026-03-01" }),
          makeTrip({ id: "b2", stage: "returned", destination: "Greece", total_value: 6000, depart_date: "2026-02-01" }),
          makeTrip({ id: "b3", stage: "pre_departure", destination: "Italy", total_value: 4000, depart_date: "2026-05-01" }),
          makeTrip({ id: "e1", stage: "enquiry", destination: "Japan", total_value: 9999, depart_date: "2026-04-01" }),
        ],
        // Second query: current open pipeline.
        [
          makeTrip({ id: "p1", stage: "quoted", total_value: 9000 }),
          makeTrip({ id: "p2", stage: "enquiry", total_value: 3000 }),
        ],
      ],
      households: [makeHousehold({ id: "n1", customer_since: "2026-02-10" })],
    });

    const r = await businessReport.run({ from: "2026-01-01", to: "2026-06-30", label: "H1" }, ctx(db));
    expect(r.shape).toBe("list");
    expect(r.value).toBe("£20k"); // 10k + 6k + 4k booked; enquiry excluded
    expect(r.summary).toMatch(/H1/);
    expect(r.summary).toMatch(/3 bookings/);
    expect(r.summary).toMatch(/£12k open pipeline/);
    expect(r.summary).toMatch(/1 new customer/);
    const dest = r.rows?.find((x) => x.id === "destinations");
    expect(dest?.subtitle).toMatch(/^Greece £16k/);
    expect(r.signals.map((s) => s.kind)).toContain("top_destination");
  });

  it("returns empty when the period has nothing to report", async () => {
    const db = fakeDb({ trips: [[], []], households: [] });
    const r = await businessReport.run({ from: "2020-01-01", to: "2020-01-31" }, ctx(db));
    expect(r.shape).toBe("empty");
    expect(r.summary).toMatch(/nothing to report/i);
  });
});

describe("customers_gone_quiet", () => {
  it("finds quiet past customers, ranked by value, and excludes recently-contacted ones", async () => {
    const db = fakeDb({
      households: [
        makeHousehold({ id: "quiet-low", display_name: "Low Value", trips_count: 2, lifetime_value: 5000, last_booking_at: isoDaysFrom(NOW, -500) }),
        makeHousehold({ id: "quiet-high", display_name: "High Value", trips_count: 4, lifetime_value: 30000, last_booking_at: isoDaysFrom(NOW, -400) }),
        makeHousehold({ id: "recent", display_name: "Recent Contact", trips_count: 3, lifetime_value: 9000, last_booking_at: isoDaysFrom(NOW, -400) }),
        makeHousehold({ id: "never", display_name: "Never Booked", trips_count: 0, customer_since: null }),
      ],
      interactions: [
        // "recent" spoke to us last month, so they are not quiet.
        { household_id: "recent", occurred_at: isoDaysFrom(NOW, -20) },
      ],
    });

    const r = await customersGoneQuiet.run({ months: 12 }, ctx(db));
    expect(r.shape).toBe("list");
    expect(r.rows?.map((x) => x.id)).toEqual(["quiet-high", "quiet-low"]);
    expect(r.rows?.[0].subtitle).toMatch(/quiet 13 months/);
    const risk = r.signals.find((s) => s.kind === "value_at_risk");
    expect(risk?.detail).toMatch(/£35k/);
    expect(r.signals.find((s) => s.kind === "top_reengage")?.detail).toMatch(/High Value/);
  });

  it("reports all-clear when nobody is quiet", async () => {
    const db = fakeDb({
      households: [makeHousehold({ id: "h1", trips_count: 2, last_booking_at: isoDaysFrom(NOW, -30) })],
      interactions: [],
    });
    const r = await customersGoneQuiet.run({}, ctx(db));
    expect(r.shape).toBe("empty");
    expect(r.summary).toMatch(/no customers quiet/i);
  });
});
