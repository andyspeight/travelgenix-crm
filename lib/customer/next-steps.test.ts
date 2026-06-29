import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { computeNextSteps } from "@/lib/customer/next-steps";
import { makeContact, makeHousehold, makeTrip, isoDaysFrom } from "@/lib/test/fixtures";
import type { Interaction } from "@/lib/supabase/types";

const NOW = new Date("2026-06-28T12:00:00.000Z");

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
});

function makeInteraction(over: Partial<Interaction> = {}): Interaction {
  return {
    id: "ix1",
    agency_id: "a1",
    household_id: "h1",
    contact_id: null,
    trip_id: null,
    kind: "email_in",
    channel: "email",
    direction: "inbound",
    subject: "Hello",
    body: "Hi",
    body_summary: null,
    ai_priority: null,
    ai_reason: null,
    ai_drafts: {},
    is_read: false,
    is_triaged: false,
    occurred_at: isoDaysFrom(NOW, -1),
    ...over,
  };
}

describe("computeNextSteps", () => {
  it("surfaces a reply step for the latest inbound message", () => {
    const steps = computeNextSteps(
      makeHousehold({ display_name: "Sarah & James Thompson" }),
      [],
      [],
      [makeInteraction({ id: "newest", subject: "Maldives", occurred_at: isoDaysFrom(NOW, -1) })]
    );
    const reply = steps.find((s) => s.kind === "reply");
    expect(reply).toBeTruthy();
    if (reply?.kind === "reply") {
      expect(reply.interactionId).toBe("newest");
      expect(reply.text).toMatch(/Sarah/);
      expect(reply.text).toMatch(/Maldives/);
    }
  });

  it("picks the most recent inbound when several exist", () => {
    const steps = computeNextSteps(makeHousehold(), [], [], [
      makeInteraction({ id: "old", occurred_at: isoDaysFrom(NOW, -10) }),
      makeInteraction({ id: "new", occurred_at: isoDaysFrom(NOW, -2) }),
    ]);
    const reply = steps.find((s) => s.kind === "reply");
    expect(reply?.kind === "reply" && reply.interactionId).toBe("new");
  });

  it("adds a confirm-trip step for an imminent departure with the trip id", () => {
    const steps = computeNextSteps(
      makeHousehold(),
      [],
      [makeTrip({ id: "trip9", stage: "pre_departure", destination: "Crete", depart_date: isoDaysFrom(NOW, 7) })],
      []
    );
    const confirm = steps.find((s) => s.kind === "task" && s.taskKind === "confirm_trip");
    expect(confirm).toBeTruthy();
    if (confirm?.kind === "task") {
      expect(confirm.tripId).toBe("trip9");
      expect(confirm.text).toMatch(/Crete/);
    }
  });

  it("does not confirm trips outside the 21-day window", () => {
    const steps = computeNextSteps(
      makeHousehold(),
      [],
      [makeTrip({ stage: "booked", depart_date: isoDaysFrom(NOW, 60) })],
      []
    );
    expect(steps.some((s) => s.kind === "task" && s.taskKind === "confirm_trip")).toBe(false);
  });

  it("adds a passport-flag step when scoring finds a passport issue", () => {
    const steps = computeNextSteps(
      makeHousehold(),
      [makeContact({ first_name: "Jane", passport_expiry: isoDaysFrom(NOW, 10) })],
      [makeTrip({ stage: "booked", depart_date: isoDaysFrom(NOW, 40) })],
      []
    );
    expect(steps.some((s) => s.kind === "task" && s.taskKind === "flag_passport")).toBe(true);
  });

  it("adds a check-in step for an established customer gone quiet", () => {
    const steps = computeNextSteps(
      makeHousehold({ trips_count: 3, last_booking_at: isoDaysFrom(NOW, -300) }),
      [],
      [],
      [makeInteraction({ direction: "outbound", kind: "email_out", occurred_at: isoDaysFrom(NOW, -200) })]
    );
    expect(steps.some((s) => s.kind === "task" && s.taskKind === "check_in")).toBe(true);
  });

  it("falls back to a single info step when nothing is actionable", () => {
    const steps = computeNextSteps(makeHousehold({ trips_count: 0 }), [], [], []);
    expect(steps).toHaveLength(1);
    expect(steps[0].kind).toBe("info");
  });

  it("never returns more than four steps", () => {
    const steps = computeNextSteps(
      makeHousehold({ trips_count: 3, last_booking_at: isoDaysFrom(NOW, -300) }),
      [makeContact({ passport_expiry: isoDaysFrom(NOW, 10) })],
      [makeTrip({ stage: "pre_departure", depart_date: isoDaysFrom(NOW, 5) })],
      [makeInteraction({ occurred_at: isoDaysFrom(NOW, -1) })]
    );
    expect(steps.length).toBeLessThanOrEqual(4);
  });
});
