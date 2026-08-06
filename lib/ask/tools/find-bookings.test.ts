import { describe, expect, it } from "vitest";
import { findBookings } from "@/lib/ask/tools/find-bookings";
import { findTool } from "@/lib/ask/registry";
import { fakeDb } from "@/lib/test/fake-db";
import { makeHousehold, makeTrip, isoDaysFrom } from "@/lib/test/fixtures";
import type { QueryContext } from "@/lib/ask/contract";

const NOW = new Date("2026-08-06T12:00:00.000Z");

function ctx(db: ReturnType<typeof fakeDb>): QueryContext {
  return { agencyId: "a1", db, now: NOW };
}

describe("find_bookings", () => {
  it("is registered", () => {
    expect(findTool("find_bookings")?.name).toBe("find_bookings");
  });

  it("answers 'bookings yet to travel over £5000': drops already-departed, sorts by value, totals", async () => {
    // The rows the DB returns after the value+stage filter it applied. The tool
    // then applies the not-yet-departed guard and the value sort in code.
    const db = fakeDb({
      trips: [
        makeTrip({ id: "t1", household_id: "h-a", stage: "booked", destination: "Maldives", total_value: 22000, depart_date: isoDaysFrom(NOW, 5) }),
        makeTrip({ id: "t2", household_id: "h-b", stage: "pre_departure", destination: "Crete", total_value: 8000, depart_date: isoDaysFrom(NOW, -10) }), // stale past → dropped
        makeTrip({ id: "t3", household_id: "h-c", stage: "booked", destination: "Rome", total_value: 6000, depart_date: null }),
      ],
      households: [
        makeHousehold({ id: "h-a", display_name: "Thompson Family", tags: ["VIP"] }),
        makeHousehold({ id: "h-c", display_name: "Patel Household" }),
      ],
    });

    const r = await findBookings.run({ min_value: 5000, stage_group: "yet_to_travel" }, ctx(db));

    expect(r.shape).toBe("list");
    expect(r.rows?.map((x) => x.id)).toEqual(["h-a", "h-c"]); // stale t2 dropped, sorted value_desc
    expect(r.summary).toMatch(/2 bookings yet to travel, worth over £5,000 \(£28,000 total\)/);
    expect(r.rows?.[0].badges).toContain("VIP");
    expect(r.rows?.[0].badges).toContain("Booked"); // stage badge shown when set spans stages
    const kinds = r.signals.map((s) => s.kind);
    expect(kinds).toContain("set_value");
    expect(kinds).toContain("top_booking");
    expect(r.signals.find((s) => s.kind === "set_value")?.detail).toMatch(/£28,000/);
    expect(r.signals.find((s) => s.kind === "top_booking")?.detail).toMatch(/£22k.*Thompson Family.*Maldives/);
    expect(r.actionable).toBe(true);
  });

  it("filters by destination in code and describes a between-values band", async () => {
    const db = fakeDb({
      trips: [
        makeTrip({ id: "t1", household_id: "h1", destination: "Chania, Crete", total_value: 3200, stage: "booked" }),
        makeTrip({ id: "t2", household_id: "h2", destination: "Rome", total_value: 4000, stage: "booked" }),
      ],
      households: [makeHousehold({ id: "h1", display_name: "Crete Lovers" })],
    });

    const r = await findBookings.run({ min_value: 2000, max_value: 5000, destination: "crete" }, ctx(db));
    expect(r.rows?.map((x) => x.id)).toEqual(["h1"]);
    expect(r.summary).toMatch(/to crete, worth between £2,000 and £5,000/);
  });

  it("returns a clear empty message when nothing matches", async () => {
    const db = fakeDb({ trips: [], households: [] });
    const r = await findBookings.run({ min_value: 100000, stage_group: "yet_to_travel" }, ctx(db));
    expect(r.shape).toBe("empty");
    expect(r.summary).toMatch(/no bookings match yet to travel, worth over £100,000/i);
  });

  it("supports max-only ('under') with a stage group and default value sort", async () => {
    const db = fakeDb({
      trips: [
        makeTrip({ id: "t1", household_id: "h1", total_value: 900, stage: "cancelled", destination: "Nice" }),
        makeTrip({ id: "t2", household_id: "h2", total_value: 1500, stage: "cancelled", destination: "Faro" }),
      ],
      households: [makeHousehold({ id: "h1" }), makeHousehold({ id: "h2" })],
    });
    const r = await findBookings.run({ max_value: 2000, stage_group: "cancelled" }, ctx(db));
    expect(r.rows?.map((x) => x.id)).toEqual(["h2", "h1"]); // 1500 before 900 (value_desc)
    expect(r.summary).toMatch(/cancelled, worth under £2,000/);
    // Single-stage group → no stage badge clutter.
    expect(r.rows?.[0].badges ?? []).not.toContain("Cancelled");
  });
});
