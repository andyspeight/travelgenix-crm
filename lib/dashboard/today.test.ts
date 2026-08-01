import { describe, expect, it } from "vitest";
import { buildToday, summariseToday, humanGap, type TodayInputs } from "@/lib/dashboard/today";

const NOW = new Date("2026-08-01T12:00:00.000Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();

const inputs = (over: Partial<TodayInputs> = {}): TodayInputs => ({
  now: NOW,
  enquiries: [],
  quotes: [],
  messages: [],
  suggestions: [],
  tasks: [],
  cases: [],
  commission: [],
  nameById: new Map([["hh-1", "Rachel Whitfield"]]),
  ...over,
});

const enquiry = (over: Partial<TodayInputs["enquiries"][number]> = {}) => ({
  id: "e1",
  who: "Rachel Whitfield",
  destination: "Crete",
  receivedAt: hoursAgo(3),
  state: "ok" as const,
  label: "1h left",
  remainingMs: 3_600_000,
  ...over,
});

describe("the order, which has to be defensible", () => {
  it("puts a broken promise above everything else", () => {
    const list = buildToday(
      inputs({
        enquiries: [enquiry({ state: "overdue", label: "2h over", receivedAt: hoursAgo(8) })],
        quotes: [{ quoteId: "q1", householdId: "hh-1", severity: 3, title: "Expiring", reason: "Expires tomorrow", actionLabel: "Chase", deadline: true }],
        suggestions: [{ id: "s1", householdId: "hh-1", severity: 3, title: "Gone quiet", reason: "No contact in 8 months", href: "/customers", actionLabel: "Get in touch", deadline: false }],
      })
    );
    expect(list[0].kind).toBe("enquiry");
    expect(list[0].breached).toBe(true);
  });

  it("puts a moving deadline above a clock that is still running", () => {
    const list = buildToday(
      inputs({
        enquiries: [enquiry({ state: "warning" })],
        quotes: [{ quoteId: "q1", householdId: "hh-1", severity: 2, title: "Expiring Friday", reason: "Expires in 2 days", actionLabel: "Chase", deadline: true }],
      })
    );
    expect(list[0].kind).toBe("quote");
    expect(list[1].kind).toBe("enquiry");
  });

  it("puts a running clock above something merely noticed", () => {
    const list = buildToday(
      inputs({
        enquiries: [enquiry({ state: "warning" })],
        suggestions: [{ id: "s1", householdId: "hh-1", severity: 3, title: "Gone quiet", reason: "8 months", href: "/customers", actionLabel: "Call", deadline: false }],
      })
    );
    expect(list[0].kind).toBe("enquiry");
  });

  it("breaks a tie by who has waited longest, not by anything else", () => {
    const list = buildToday(
      inputs({
        enquiries: [
          enquiry({ id: "recent", state: "overdue", receivedAt: hoursAgo(5) }),
          enquiry({ id: "oldest", state: "overdue", receivedAt: hoursAgo(30) }),
        ],
      })
    );
    expect(list[0].id).toBe("enquiry:oldest");
  });

  it("leaves out an enquiry that has already been answered", () => {
    expect(buildToday(inputs({ enquiries: [enquiry({ state: "responded" })] }))).toEqual([]);
  });
});

describe("every row says why it is there", () => {
  it("gives an overdue enquiry the reason in plain English", () => {
    const [item] = buildToday(
      inputs({ enquiries: [enquiry({ state: "overdue", receivedAt: hoursAgo(19) })] })
    );
    expect(item.reason).toMatch(/Waiting 19 hours/);
    expect(item.reason).toMatch(/past the response time/);
  });

  it("names the customer on a quote alert", () => {
    const [item] = buildToday(
      inputs({
        quotes: [{ quoteId: "q1", householdId: "hh-1", severity: 2, title: "Sent 6 days ago", reason: "Viewed 3 times, no reply", actionLabel: "Chase", deadline: false }],
      })
    );
    expect(item.who).toBe("Rachel Whitfield");
    expect(item.action).toBe("Chase");
  });

  it("never leaves a row without a reason", () => {
    const list = buildToday(
      inputs({
        messages: [{ id: "m1", householdId: "hh-1", subject: "Change of dates", occurredAt: hoursAgo(2), reason: null }],
        tasks: [{ id: "t1", title: "Send balance reminder", householdId: "hh-1", dueAt: hoursAgo(50) }],
      })
    );
    expect(list.every((x) => x.reason.length > 10)).toBe(true);
  });

  it("says plainly when a task has no customer attached", () => {
    const [item] = buildToday(
      inputs({ tasks: [{ id: "t1", title: "Renew ABTA", householdId: null, dueAt: hoursAgo(24) }] })
    );
    expect(item.who).toBe("No customer attached");
  });
});

describe("a customer with a problem", () => {
  it("puts an overdue service case with the broken promises", () => {
    const list = buildToday(
      inputs({
        cases: [{ id: "c1", householdId: "hh-1", subject: "Hotel overbooked", priority: 1, reason: "They are at the desk now", slaDueAt: hoursAgo(2) }],
        quotes: [{ quoteId: "q1", householdId: "hh-1", severity: 3, title: "Expiring", reason: "Tomorrow", actionLabel: "Chase", deadline: true }],
      })
    );
    expect(list[0].kind).toBe("case");
    expect(list[0].breached).toBe(true);
    expect(list[0].reason).toMatch(/past the time you promised/);
  });

  it("still ranks a case with time left above a quote going quiet", () => {
    const list = buildToday(
      inputs({
        cases: [{ id: "c1", householdId: "hh-1", subject: "Flight moved", priority: 2, reason: null, slaDueAt: null }],
        quotes: [{ quoteId: "q1", householdId: "hh-1", severity: 3, title: "Quiet", reason: "No reply", actionLabel: "Chase", deadline: false }],
      })
    );
    expect(list[0].kind).toBe("case");
  });
});

describe("money the agency is owed", () => {
  it("puts late commission with the broken promises", () => {
    const list = buildToday(
      inputs({
        commission: [{ tripId: "t1", supplierName: "Jet2 Holidays", amount: 412, daysOverdue: 21, reason: "21 days past their terms." }],
        suggestions: [{ id: "s1", householdId: "hh-1", severity: 3, title: "Gone quiet", reason: "8 months", href: "/x", actionLabel: "Call", deadline: false }],
      })
    );
    expect(list[0].kind).toBe("commission");
    expect(list[0].headline).toBe("£412 unpaid commission");
    expect(list[0].who).toBe("Jet2 Holidays");
  });
});

describe("the sentence above the list", () => {
  it("says nothing is waiting when nothing is", () => {
    expect(summariseToday([])).toBe("Nothing is waiting on you.");
  });

  it("counts the broken promises separately, because they read differently", () => {
    const list = buildToday(
      inputs({
        enquiries: [enquiry({ state: "overdue" }), enquiry({ id: "e2", state: "warning" })],
        suggestions: [{ id: "s1", householdId: "hh-1", severity: 1, title: "Gone quiet", reason: "8 months", href: "/x", actionLabel: "Call", deadline: false }],
      })
    );
    expect(summariseToday(list)).toBe("1 past its due time, 2 to look at.");
  });

  it("never claims you are caught up while it is holding work", () => {
    const list = buildToday(inputs({ enquiries: [enquiry({ state: "warning" })] }));
    expect(summariseToday(list)).not.toMatch(/caught up|nothing/i);
  });
});

describe("how long things are described", () => {
  it("uses the largest unit that is still honest", () => {
    expect(humanGap(30 * 60_000)).toBe("30 minutes");
    expect(humanGap(19 * 3_600_000)).toBe("19 hours");
    expect(humanGap(72 * 3_600_000)).toBe("3 days");
  });

  it("gets the singular right", () => {
    expect(humanGap(3_600_000)).toBe("1 hour");
    expect(humanGap(24 * 3_600_000 * 1)).toBe("24 hours");
  });
});
