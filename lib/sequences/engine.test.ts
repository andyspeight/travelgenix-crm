import { describe, expect, it } from "vitest";
import { decideNext, type DecideInput, type SequenceStep } from "@/lib/sequences/engine";

const NOW = new Date("2026-07-31T12:00:00.000Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

const STEPS: SequenceStep[] = [
  { stepNumber: 1, delayDays: 0, subject: "Your quote", body: "..." },
  { stepNumber: 2, delayDays: 3, subject: "Just checking", body: "..." },
  { stepNumber: 3, delayDays: 7, subject: "Last nudge", body: "..." },
];

const input = (over: Partial<DecideInput> = {}): DecideInput => ({
  enrolment: {
    enrolledAt: daysAgo(4),
    stepsSent: 1,
    lastSentAt: daysAgo(4),
    status: "active",
  },
  steps: STEPS,
  signals: {},
  purpose: "operational",
  now: NOW,
  ...over,
});

describe("stopping — the part that makes this service rather than spam", () => {
  it("stops the moment they reply, even mid-sequence with a step due", () => {
    const d = decideNext(input({ signals: { repliedAt: daysAgo(1) } }));
    expect(d.action).toBe("stop");
    if (d.action === "stop") expect(d.reason).toMatch(/replied/);
  });

  it("checks for a reply even when no step is due — not only at send time", () => {
    // Enrolled today, step 2 not due for 3 days. A naive runner would skip
    // this enrolment entirely and never notice the reply.
    const d = decideNext(
      input({
        enrolment: { enrolledAt: daysAgo(0), stepsSent: 1, lastSentAt: daysAgo(0), status: "active" },
        signals: { repliedAt: daysAgo(0) },
      })
    );
    expect(d.action).toBe("stop");
  });

  it("stops when the thing being chased is resolved", () => {
    const d = decideNext(
      input({ signals: { resolved: { at: daysAgo(1), what: "the quote was accepted" } } })
    );
    expect(d.action).toBe("stop");
    if (d.action === "stop") expect(d.reason).toMatch(/the quote was accepted/);
  });

  it("stops rather than bouncing again into a dead address", () => {
    expect(decideNext(input({ signals: { undeliverable: true } })).action).toBe("stop");
  });

  it("an agent pressing stop outranks everything", () => {
    const d = decideNext(
      input({ signals: { stoppedByHand: true, repliedAt: null, resolved: null } })
    );
    expect(d.action).toBe("stop");
    if (d.action === "stop") expect(d.reason).toMatch(/agent/);
  });
});

describe("consent applies to marketing, not to service", () => {
  it("a marketing chase stops when consent is withdrawn", () => {
    expect(
      decideNext(input({ purpose: "marketing", signals: { consentWithdrawn: true } })).action
    ).toBe("stop");
  });

  it("an operational chase does NOT stop on a marketing withdrawal", () => {
    // Chasing a live quote is service under PECR. Stopping it here would
    // silently abandon a customer who is mid-booking.
    const d = decideNext(input({ purpose: "operational", signals: { consentWithdrawn: true } }));
    expect(d.action).toBe("send");
  });
});

describe("timing", () => {
  it("sends the next step once its delay has elapsed", () => {
    const d = decideNext(input());
    expect(d.action).toBe("send");
    if (d.action === "send") expect(d.step.stepNumber).toBe(2);
  });

  it("waits, and says how long, before a step is due", () => {
    const d = decideNext(
      input({
        enrolment: { enrolledAt: daysAgo(1), stepsSent: 1, lastSentAt: daysAgo(1), status: "active" },
      })
    );
    expect(d.action).toBe("wait");
    if (d.action === "wait") expect(d.reason).toMatch(/due in 2 days/);
  });

  it("measures delays from enrolment, so a late step does not shift the rest", () => {
    // Day 8: steps 1 and 2 sent. Step 3 (day 7) is due on its own schedule,
    // not seven days after step 2.
    const d = decideNext(
      input({
        enrolment: { enrolledAt: daysAgo(8), stepsSent: 2, lastSentAt: daysAgo(5), status: "active" },
      })
    );
    expect(d.action).toBe("send");
    if (d.action === "send") expect(d.step.stepNumber).toBe(3);
  });

  it("never sends twice in a day, even when a missed run left several overdue", () => {
    const d = decideNext(
      input({
        enrolment: { enrolledAt: daysAgo(20), stepsSent: 1, lastSentAt: daysAgo(0.2), status: "active" },
      })
    );
    expect(d.action).toBe("wait");
    if (d.action === "wait") expect(d.reason).toMatch(/already sent today/);
  });
});

describe("finishing", () => {
  it("completes once every step has gone", () => {
    const d = decideNext(
      input({
        enrolment: { enrolledAt: daysAgo(20), stepsSent: 3, lastSentAt: daysAgo(13), status: "active" },
      })
    );
    expect(d.action).toBe("complete");
  });

  it("completes rather than looping on a sequence with no steps", () => {
    expect(decideNext(input({ steps: [] })).action).toBe("complete");
  });

  it("does nothing to an enrolment that is already stopped", () => {
    const d = decideNext(
      input({
        enrolment: { enrolledAt: daysAgo(9), stepsSent: 1, lastSentAt: daysAgo(9), status: "stopped" },
      })
    );
    expect(d.action).toBe("wait");
  });
});
