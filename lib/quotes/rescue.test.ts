import { describe, expect, it } from "vitest";
import { assessQuote, rescueAlerts, type QuoteTripContext } from "@/lib/quotes/rescue";
import type { Quote } from "@/lib/supabase/types";

const NOW = "2026-07-23T12:00:00.000Z";

const iso = (daysFromNow: number) =>
  new Date(new Date(NOW).getTime() + daysFromNow * 86_400_000).toISOString();

let seq = 0;
const quote = (over: Partial<Quote> = {}): Quote => ({
  id: `q-${++seq}`,
  agency_id: "a",
  trip_id: "t-1",
  household_id: "h-1",
  reference: null,
  version: 1,
  status: "sent",
  total_price: 4000,
  deposit: null,
  expected_margin: null,
  currency: "GBP",
  options_summary: null,
  sent_at: iso(-2),
  expires_at: null,
  viewed_at: null,
  view_count: 0,
  customer_response: null,
  declined_reason: null,
  notes: null,
  created_at: iso(-2),
  updated_at: iso(-2),
  ...over,
});

const trip = (over: Partial<QuoteTripContext> = {}): QuoteTripContext => ({
  depart_date: iso(120).slice(0, 10),
  destination: "Crete",
  ...over,
});

describe("assessQuote", () => {
  it("leaves a fresh quote alone", () => {
    expect(assessQuote(quote({ sent_at: iso(-1) }), trip(), NOW)).toBeNull();
  });

  it("ignores resolved quotes whatever their history", () => {
    const q = quote({ status: "accepted", view_count: 9, expires_at: iso(-5) });
    expect(assessQuote(q, trip(), NOW)).toBeNull();
  });

  it("fires the signature demo: viewed repeatedly with no response wants a CALL", () => {
    const q = quote({
      status: "viewed",
      view_count: 4,
      viewed_at: iso(-1),
      total_price: 8600,
    });
    const a = assessQuote(q, trip(), NOW)!;
    expect(a.signals).toContain("engaged_no_response");
    expect(a.action).toBe("call");
    expect(a.severity).toBe(3); // high value amplifies
    expect(a.title).toMatch(/£8,600 quote for Crete viewed 4 times/);
  });

  it("engaged-but-cheap is act-today, not act-now", () => {
    const q = quote({ status: "viewed", view_count: 3, viewed_at: iso(-1), total_price: 1200 });
    expect(assessQuote(q, trip(), NOW)!.severity).toBe(2);
  });

  it("a recorded customer response silences the engagement alarm", () => {
    const q = quote({
      status: "viewed",
      view_count: 5,
      viewed_at: iso(-1),
      customer_response: "Thinking it over until payday",
    });
    expect(assessQuote(q, trip(), NOW)).toBeNull();
  });

  it("expiring soon outranks engagement and asks for a decision", () => {
    const q = quote({ status: "viewed", view_count: 4, viewed_at: iso(-1), expires_at: iso(2) });
    const a = assessQuote(q, trip(), NOW)!;
    expect(a.signals).toEqual(expect.arrayContaining(["expiring_soon", "engaged_no_response"]));
    expect(a.action).toBe("decide_expiry");
    expect(a.severity).toBe(3);
  });

  it("flags an expired quote nobody marked", () => {
    const a = assessQuote(quote({ expires_at: iso(-3) }), trip(), NOW)!;
    expect(a.signals).toContain("expired_unmarked");
    expect(a.title).toMatch(/has expired/);
  });

  it("sent and never opened escalates with age", () => {
    const young = assessQuote(quote({ sent_at: iso(-4) }), trip(), NOW)!;
    const old = assessQuote(quote({ sent_at: iso(-9) }), trip(), NOW)!;
    expect(young.signals).toContain("never_viewed");
    expect(young.severity).toBe(1);
    expect(old.severity).toBe(2);
    expect(old.reason).toMatch(/check it landed/i);
  });

  it("departure inside 3 weeks forces act-now", () => {
    const a = assessQuote(
      quote({ sent_at: iso(-4) }),
      trip({ depart_date: iso(14).slice(0, 10) }),
      NOW
    )!;
    expect(a.signals).toContain("departure_approaching");
    expect(a.severity).toBe(3);
  });

  it("quiet after a single view asks for a nudge", () => {
    const a = assessQuote(
      quote({ status: "viewed", view_count: 1, viewed_at: iso(-5) }),
      trip(),
      NOW
    )!;
    expect(a.signals).toContain("gone_quiet_after_viewing");
    expect(a.action).toBe("nudge");
  });
});

describe("rescueAlerts", () => {
  it("sorts by severity then value and drops the healthy", () => {
    const q1 = quote({ id: "cheap-old", sent_at: iso(-4), total_price: 900 });
    const q2 = quote({
      id: "big-engaged",
      status: "viewed",
      view_count: 5,
      viewed_at: iso(-1),
      total_price: 9000,
    });
    const q3 = quote({ id: "fresh", sent_at: iso(-1) });
    const q4 = quote({
      id: "mid-expiring",
      status: "viewed",
      view_count: 1,
      viewed_at: iso(-1),
      expires_at: iso(1),
      total_price: 3000,
    });

    const alerts = rescueAlerts([q1, q2, q3, q4], new Map([["t-1", trip()]]), NOW);
    expect(alerts.map((a) => a.quoteId)).toEqual(["big-engaged", "mid-expiring", "cheap-old"]);
  });
});
