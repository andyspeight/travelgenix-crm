import { describe, expect, it } from "vitest";
import { computeHealth, overallState, type HealthInputs } from "@/lib/health/checks";

const NOW = new Date("2026-07-31T12:00:00.000Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();

const inputs = (over: Partial<HealthInputs> = {}): HealthInputs => ({
  now: NOW,
  lastCronRun: { startedAt: hoursAgo(6), status: "ok", actions: 4 },
  cronEnabled: true,
  emailConfigured: true,
  failedSends7d: 0,
  bounced7d: 0,
  totalSends7d: 40,
  suppressed: 0,
  aiConfigured: true,
  controlConfigured: true,
  ...over,
});

const check = (i: HealthInputs, id: string) => computeHealth(i).find((c) => c.id === id)!;

describe("the schedule — the failure that makes no noise", () => {
  it("is happy after a recent clean run", () => {
    const c = check(inputs(), "schedule");
    expect(c.state).toBe("ok");
    expect(c.value).toMatch(/ran 6 hours ago/);
  });

  it("warns when a nightly run looks to have been missed", () => {
    expect(check(inputs({ lastCronRun: { startedAt: hoursAgo(30), status: "ok", actions: 0 } }), "schedule").state)
      .toBe("warn");
  });

  it("calls it bad after two days — reminders are genuinely not going out", () => {
    const c = check(inputs({ lastCronRun: { startedAt: hoursAgo(50), status: "ok", actions: 0 } }), "schedule");
    expect(c.state).toBe("bad");
    expect(c.detail).toMatch(/not going out/);
  });

  it("distinguishes 'switched off' from 'broken'", () => {
    const off = check(inputs({ cronEnabled: false }), "schedule");
    expect(off.state).toBe("off");
    expect(off.detail).toMatch(/CRON_SECRET/);

    const never = check(inputs({ lastCronRun: null }), "schedule");
    expect(never.state).toBe("warn");
    expect(never.value).toBe("never run");
  });

  it("surfaces a failed or partial run even when it was recent", () => {
    expect(check(inputs({ lastCronRun: { startedAt: hoursAgo(2), status: "failed", actions: 0 } }), "schedule").state)
      .toBe("warn");
    expect(check(inputs({ lastCronRun: { startedAt: hoursAgo(2), status: "partial", actions: 3 } }), "schedule").detail)
      .toMatch(/Some agencies were skipped/);
  });
});

describe("sending failures — judged as a rate, not a bare count", () => {
  it("is quiet when nothing failed", () => {
    expect(check(inputs(), "sending").state).toBe("ok");
  });

  it("treats a few failures in a large volume as worth a look, not an alarm", () => {
    expect(check(inputs({ failedSends7d: 2, totalSends7d: 200 }), "sending").state).toBe("warn");
  });

  it("treats a few failures in a tiny volume as broken configuration", () => {
    const c = check(inputs({ failedSends7d: 3, totalSends7d: 4 }), "sending");
    expect(c.state).toBe("bad");
    expect(c.detail).toMatch(/verified with the provider/);
  });

  it("says 'not configured' rather than 'healthy' when nothing can send", () => {
    expect(check(inputs({ emailConfigured: false }), "sending").state).toBe("off");
  });
});

describe("deliverability", () => {
  it("flags a bounce rate that would damage sending reputation", () => {
    const c = check(inputs({ bounced7d: 5, totalSends7d: 40 }), "deliverability");
    expect(c.state).toBe("bad");
    expect(c.detail).toMatch(/reputation/);
  });

  it("mentions blocked addresses even when nothing bounced recently", () => {
    expect(check(inputs({ suppressed: 3 }), "deliverability").value).toMatch(/3 addresses blocked/);
  });
});

describe("configuration checks are honest about being off", () => {
  it("says plainly when the CRM has no sign-in at all", () => {
    const c = check(inputs({ controlConfigured: false }), "signin");
    expect(c.state).toBe("off");
    expect(c.detail).toMatch(/Anyone with the address/);
  });

  it("notes that AI falling back is not a breakage", () => {
    expect(check(inputs({ aiConfigured: false }), "ai").detail).toMatch(/Nothing breaks/);
  });
});

describe("overallState — the worst thing present", () => {
  it("bad beats warn beats off beats ok", () => {
    expect(overallState(computeHealth(inputs()))).toBe("ok");
    expect(overallState(computeHealth(inputs({ aiConfigured: false })))).toBe("off");
    expect(overallState(computeHealth(inputs({ lastCronRun: null })))).toBe("warn");
    expect(
      overallState(computeHealth(inputs({ lastCronRun: { startedAt: hoursAgo(60), status: "ok", actions: 0 } })))
    ).toBe("bad");
  });
});
