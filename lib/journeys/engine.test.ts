import { describe, expect, it } from "vitest";
import {
  buildAction,
  buildLastContactMap,
  describeTrigger,
  evaluateJourney,
  type EvalContext,
  type Journey,
} from "@/lib/journeys/engine";
import { makeContact, makeHousehold, makeTrip, isoDaysFrom } from "@/lib/test/fixtures";

const NOW = new Date("2026-06-28T12:00:00.000Z");

function makeJourney(over: Partial<Journey> = {}): Journey {
  return {
    id: "j1",
    agency_id: "a1",
    name: "Test journey",
    description: null,
    trigger_kind: "days_to_departure",
    trigger_config: {},
    action_kind: "create_task",
    action_config: {},
    is_active: true,
    last_run_at: null,
    created_at: "2020-01-01T00:00:00.000Z",
    updated_at: "2020-01-01T00:00:00.000Z",
    ...over,
  };
}

function ctx(over: Partial<EvalContext> = {}): EvalContext {
  return {
    now: NOW,
    households: [],
    trips: [],
    contacts: [],
    lastContactByHousehold: new Map(),
    ...over,
  };
}

describe("evaluateJourney — days_to_departure", () => {
  const journey = makeJourney({
    trigger_kind: "days_to_departure",
    trigger_config: { days: 10 },
  });

  it("matches booked/pre-departure trips inside the window", () => {
    const trips = [
      makeTrip({ id: "in", stage: "booked", depart_date: isoDaysFrom(NOW, 5) }),
      makeTrip({ id: "pre", stage: "pre_departure", depart_date: isoDaysFrom(NOW, 10) }),
    ];
    const out = evaluateJourney(journey, ctx({ trips }));
    expect(out.map((c) => c.trip_id).sort()).toEqual(["in", "pre"]);
  });

  it("excludes trips outside the window, in the past, or in the wrong stage", () => {
    const trips = [
      makeTrip({ id: "far", stage: "booked", depart_date: isoDaysFrom(NOW, 20) }),
      makeTrip({ id: "past", stage: "booked", depart_date: isoDaysFrom(NOW, -2) }),
      makeTrip({ id: "enq", stage: "enquiry", depart_date: isoDaysFrom(NOW, 5) }),
    ];
    expect(evaluateJourney(journey, ctx({ trips }))).toHaveLength(0);
  });
});

describe("evaluateJourney — passport_expiring", () => {
  const journey = makeJourney({
    trigger_kind: "passport_expiring",
    trigger_config: { days: 180 },
  });

  it("matches soon-to-expire and already-expired passports", () => {
    const contacts = [
      makeContact({ id: "soon", first_name: "Soon", passport_expiry: isoDaysFrom(NOW, 90) }),
      makeContact({ id: "gone", first_name: "Gone", passport_expiry: isoDaysFrom(NOW, -10) }),
      makeContact({ id: "fine", first_name: "Fine", passport_expiry: isoDaysFrom(NOW, 400) }),
    ];
    const out = evaluateJourney(journey, ctx({ contacts }));
    expect(out).toHaveLength(2);
    expect(out.find((c) => /Gone/.test(c.subject ?? ""))?.reason).toMatch(/expired/i);
    expect(out.find((c) => /Soon/.test(c.subject ?? ""))?.reason).toMatch(/expires in/i);
  });
});

describe("evaluateJourney — no_contact_period", () => {
  const journey = makeJourney({
    trigger_kind: "no_contact_period",
    trigger_config: { months: 12 },
  });

  it("matches quiet past customers but skips never-booked households", () => {
    const households = [
      makeHousehold({ id: "quiet", trips_count: 2, last_booking_at: isoDaysFrom(NOW, -400) }),
      makeHousehold({ id: "fresh", trips_count: 0, customer_since: null }),
      makeHousehold({ id: "recent", trips_count: 1, last_booking_at: isoDaysFrom(NOW, -30) }),
    ];
    const out = evaluateJourney(journey, ctx({ households }));
    expect(out.map((c) => c.household_id)).toEqual(["quiet"]);
  });

  it("prefers the interaction map over last_booking_at", () => {
    const households = [
      makeHousehold({ id: "h1", trips_count: 3, last_booking_at: isoDaysFrom(NOW, -400) }),
    ];
    // A recent interaction should disqualify the otherwise-quiet household.
    const lastContactByHousehold = new Map([["h1", isoDaysFrom(NOW, -20)]]);
    expect(evaluateJourney(journey, ctx({ households, lastContactByHousehold }))).toHaveLength(0);
  });
});

describe("evaluateJourney — caps and unwired triggers", () => {
  it("caps candidates at 50", () => {
    const trips = Array.from({ length: 80 }, (_, i) =>
      makeTrip({ id: `t${i}`, stage: "booked", depart_date: isoDaysFrom(NOW, 3) })
    );
    const journey = makeJourney({ trigger_kind: "days_to_departure", trigger_config: { days: 10 } });
    expect(evaluateJourney(journey, ctx({ trips }))).toHaveLength(50);
  });

  it("matches nothing for triggers with no data source", () => {
    for (const kind of ["birthday", "anniversary", "custom"] as const) {
      expect(evaluateJourney(makeJourney({ trigger_kind: kind }), ctx())).toHaveLength(0);
    }
  });
});

describe("buildLastContactMap", () => {
  it("keeps the most recent occurred_at per household and skips null ids", () => {
    const map = buildLastContactMap([
      { household_id: "h1", occurred_at: "2026-01-01T00:00:00.000Z" },
      { household_id: "h1", occurred_at: "2026-03-01T00:00:00.000Z" },
      { household_id: null, occurred_at: "2026-05-01T00:00:00.000Z" },
    ]);
    expect(map.get("h1")).toBe("2026-03-01T00:00:00.000Z");
    expect(map.size).toBe(1);
  });
});

describe("describeTrigger", () => {
  it("renders human-readable summaries", () => {
    expect(
      describeTrigger({ trigger_kind: "days_to_departure", trigger_config: { days: 10 } })
    ).toBe("10 days before departure");
    expect(
      describeTrigger({ trigger_kind: "no_contact_period", trigger_config: { months: 12 } })
    ).toBe("No contact for 12 months");
  });
});

describe("buildAction", () => {
  it("builds a create_task action using the configured title and reason", () => {
    const journey = makeJourney({
      action_kind: "create_task",
      action_config: { title: "Confirm details" },
    });
    const action = buildAction(
      journey,
      { household_id: "h1", trip_id: "t1", reason: "Crete departs in 5 days" },
      "Smith Family"
    );
    expect(action).toEqual({
      kind: "create_task",
      title: "Confirm details",
      description: "Crete departs in 5 days",
    });
  });

  it("builds a warm welcome-home email naming the destination and first name", () => {
    const journey = makeJourney({
      trigger_kind: "days_after_return",
      action_kind: "draft_email",
    });
    const action = buildAction(
      journey,
      { household_id: "h1", trip_id: "t1", reason: "Returned 3 days ago", destination: "Crete" },
      "Jane & John Smith"
    );
    if (action.kind !== "draft_email") throw new Error("expected draft_email");
    expect(action.subject).toMatch(/Crete/);
    expect(action.body).toMatch(/^Hi Jane,/);
  });
});
