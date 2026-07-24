import { describe, expect, it } from "vitest";
import { computeCasePriority, slaDueAt, SLA_HOURS, type CaseTravelContext } from "@/lib/cases/priority";

const NOW = "2026-07-24T09:00:00.000Z";

const iso = (daysFromNow: number) =>
  new Date(new Date(NOW).getTime() + daysFromNow * 86_400_000).toISOString().slice(0, 10);

const ctx = (over: Partial<CaseTravelContext> = {}): CaseTravelContext => ({
  trip: null,
  contacts: [],
  ...over,
});

describe("computeCasePriority — the blueprint rule", () => {
  it("a customer travelling right now outranks a routine post-trip question", () => {
    const stranded = computeCasePriority(
      "accommodation_issue",
      ctx({ trip: { stage: "travelling", depart_date: iso(-3), destination: "Rhodes", total_value: 3000 } }),
      NOW
    );
    const routine = computeCasePriority("post_trip_complaint", ctx(), NOW);
    expect(stranded.priority).toBe(1);
    expect(stranded.reason).toMatch(/travelling right now/);
    expect(routine.priority).toBe(4);
    expect(stranded.slaHours).toBe(2);
    expect(routine.slaHours).toBe(72);
  });

  it("an emergency is P1 even with no trip linked", () => {
    const p = computeCasePriority("in_destination_emergency", ctx(), NOW);
    expect(p.priority).toBe(1);
  });

  it("departure within 7 days forces at least P2", () => {
    const p = computeCasePriority(
      "documentation",
      ctx({ trip: { stage: "pre_departure", depart_date: iso(4), destination: "Faro", total_value: 2000 } }),
      NOW
    );
    expect(p.priority).toBe(2);
    // depart_date is date-only; measured against a 9am clock it floors to 3.
    expect(p.reason).toMatch(/departure is in 3 days/);
  });

  it("children in the party bump a near-departure case", () => {
    const without = computeCasePriority(
      "complaint",
      ctx({ trip: { stage: "booked", depart_date: iso(14), destination: "Crete", total_value: 3000 } }),
      NOW
    );
    const withKids = computeCasePriority(
      "complaint",
      ctx({
        trip: { stage: "booked", depart_date: iso(14), destination: "Crete", total_value: 3000 },
        contacts: [{ role: "child", flags: [] }, { role: "child", flags: [] }],
      }),
      NOW
    );
    expect(withKids.priority).toBeLessThan(without.priority);
    expect(withKids.reason).toMatch(/2 children in the party/);
  });

  it("vulnerable-traveller flags bump priority anywhere", () => {
    const p = computeCasePriority(
      "refund",
      ctx({ contacts: [{ role: "lead", flags: ["mobility assistance"] }] }),
      NOW
    );
    expect(p.priority).toBe(2);
    expect(p.reason).toMatch(/mobility assistance/);
  });

  it("a big booking raises the stakes one notch, but never to P1 on its own", () => {
    const p = computeCasePriority(
      "amendment",
      ctx({ trip: { stage: "booked", depart_date: iso(90), destination: "Maldives", total_value: 12000 } }),
      NOW
    );
    expect(p.priority).toBe(2);
    expect(p.reason).toMatch(/£12,000 booking at stake/);
  });

  it("priority never leaves the 1–4 band and the reason always explains itself", () => {
    const p = computeCasePriority(
      "flight_disruption",
      ctx({
        trip: { stage: "travelling", depart_date: iso(-1), destination: "Palma", total_value: 20000 },
        contacts: [{ role: "child", flags: ["medical"] }],
      }),
      NOW
    );
    expect(p.priority).toBe(1);
    expect(p.reason.startsWith("P1:")).toBe(true);
  });
});

describe("slaDueAt", () => {
  it("stamps the due time from the priority's target", () => {
    expect(slaDueAt(NOW, SLA_HOURS[1])).toBe("2026-07-24T11:00:00.000Z");
    expect(slaDueAt(NOW, SLA_HOURS[4])).toBe("2026-07-27T09:00:00.000Z");
  });
});
