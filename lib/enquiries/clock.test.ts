import { describe, expect, it } from "vitest";
import { clockState, responseDueAt, DEFAULT_SLA_HOURS } from "@/lib/enquiries/clock";

const RECEIVED = "2026-07-23T08:00:00.000Z";
const DUE = responseDueAt(RECEIVED); // 12:00Z with the 4h default

describe("responseDueAt", () => {
  it("adds the SLA window to the received time", () => {
    expect(DUE).toBe("2026-07-23T12:00:00.000Z");
    expect(DEFAULT_SLA_HOURS).toBe(4);
  });
});

describe("clockState", () => {
  it("is ok early in the window with a remaining label", () => {
    const c = clockState({ receivedAt: RECEIVED, dueAt: DUE, respondedAt: null, now: "2026-07-23T08:30:00.000Z" });
    expect(c.state).toBe("ok");
    expect(c.label).toBe("3h 30m left");
  });

  it("warns in the final quarter of the window", () => {
    const c = clockState({ receivedAt: RECEIVED, dueAt: DUE, respondedAt: null, now: "2026-07-23T11:15:00.000Z" });
    expect(c.state).toBe("warning");
    expect(c.label).toBe("45m left");
  });

  it("goes overdue past the due time and counts up", () => {
    const c = clockState({ receivedAt: RECEIVED, dueAt: DUE, respondedAt: null, now: "2026-07-23T13:10:00.000Z" });
    expect(c.state).toBe("overdue");
    expect(c.label).toBe("1h 10m over");
    expect(c.remainingMs).toBeLessThan(0);
  });

  it("shows time-to-respond once responded, regardless of now", () => {
    const c = clockState({
      receivedAt: RECEIVED,
      dueAt: DUE,
      respondedAt: "2026-07-23T09:20:00.000Z",
      now: "2026-07-25T00:00:00.000Z",
    });
    expect(c.state).toBe("responded");
    expect(c.label).toBe("responded in 1h 20m");
  });

  it("falls back to age when no due date exists (legacy rows)", () => {
    const c = clockState({ receivedAt: RECEIVED, dueAt: null, respondedAt: null, now: "2026-07-23T10:00:00.000Z" });
    expect(c.state).toBe("ok");
    expect(c.label).toBe("waiting 2h");
  });

  it("uses day units for long overruns", () => {
    const c = clockState({ receivedAt: RECEIVED, dueAt: DUE, respondedAt: null, now: "2026-07-26T14:00:00.000Z" });
    expect(c.state).toBe("overdue");
    expect(c.label).toBe("3d 2h over");
  });
});
