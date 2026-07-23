import { describe, expect, it } from "vitest";
import {
  scoreEnquiry,
  scoreLikelihood,
  scoreValue,
  scoreUrgency,
  scoreFit,
  type EnquiryFacts,
  type RelationshipFacts,
} from "@/lib/enquiries/scoring";

const NOW = "2026-07-23T09:00:00.000Z";

const facts = (over: Partial<EnquiryFacts> = {}): EnquiryFacts => ({
  destination: null,
  depart_date: null,
  date_flexibility: null,
  duration_nights: null,
  adults: null,
  children: null,
  budget: null,
  budget_basis: null,
  holiday_type: null,
  occasion: null,
  source: null,
  contact_email: "a@b.com",
  contact_phone: null,
  ...over,
});

const rel = (over: Partial<NonNullable<RelationshipFacts>> = {}): RelationshipFacts => ({
  lifetime_value: 0,
  trips_count: 0,
  last_booking_at: null,
  tags: [],
  ...over,
});

describe("scoreLikelihood", () => {
  it("is null with no way to reach the customer", () => {
    const s = scoreLikelihood(facts({ contact_email: null, contact_phone: null }), null, NOW);
    expect(s.score).toBeNull();
    expect(s.reason).toMatch(/no email or phone/i);
  });

  it("rises with completeness: destination + dates + budget beats bare contact", () => {
    const bare = scoreLikelihood(facts(), null, NOW);
    const full = scoreLikelihood(
      facts({ destination: "Crete", depart_date: "2026-09-01", budget: 4000 }),
      null,
      NOW
    );
    expect(full.score!).toBeGreaterThan(bare.score!);
  });

  it("credits an existing customer", () => {
    const cold = scoreLikelihood(facts({ destination: "Rome" }), null, NOW);
    const warm = scoreLikelihood(facts({ destination: "Rome" }), rel({ trips_count: 3 }), NOW);
    expect(warm.score!).toBeGreaterThan(cold.score!);
    expect(warm.reason).toMatch(/existing customer/);
  });

  it("gives the near-fixed-dates buyer boost", () => {
    const flexible = scoreLikelihood(
      facts({ depart_date: "2026-08-20", date_flexibility: "flexible" }),
      null,
      NOW
    );
    const fixed = scoreLikelihood(
      facts({ depart_date: "2026-08-20", date_flexibility: "fixed" }),
      null,
      NOW
    );
    expect(fixed.score!).toBeGreaterThan(flexible.score!);
  });
});

describe("scoreValue", () => {
  it("reads a total budget into bands", () => {
    expect(scoreValue(facts({ budget: 12000 }), null).score).toBe(92);
    expect(scoreValue(facts({ budget: 2500 }), null).score).toBe(45);
  });

  it("multiplies per-person budgets by the party", () => {
    const s = scoreValue(
      facts({ budget: 2000, budget_basis: "per_person", adults: 2, children: 2 }),
      null
    );
    // 2000 × 4 = 8000 → the 6000+ band
    expect(s.score).toBe(78);
    expect(s.reason).toMatch(/£2,?000 per person × 4/);
  });

  it("falls back to booking history when no budget is stated", () => {
    const s = scoreValue(facts(), rel({ trips_count: 4, lifetime_value: 28000 }));
    expect(s.score).toBe(70);
    expect(s.reason).toMatch(/average £7,000/);
  });

  it("is null with no budget and no history", () => {
    const s = scoreValue(facts(), null);
    expect(s.score).toBeNull();
  });
});

describe("scoreUrgency", () => {
  it("is null with no travel date", () => {
    expect(scoreUrgency(facts(), NOW).score).toBeNull();
  });

  it("scales with proximity", () => {
    const near = scoreUrgency(facts({ depart_date: "2026-07-30" }), NOW);
    const mid = scoreUrgency(facts({ depart_date: "2026-10-01" }), NOW);
    const far = scoreUrgency(facts({ depart_date: "2027-06-01" }), NOW);
    expect(near.score!).toBeGreaterThan(mid.score!);
    expect(mid.score!).toBeGreaterThan(far.score!);
  });

  it("flags a past travel date rather than scoring it high", () => {
    const s = scoreUrgency(facts({ depart_date: "2026-07-01" }), NOW);
    expect(s.score).toBe(20);
    expect(s.reason).toMatch(/already passed/i);
  });

  it("softens for very flexible dates", () => {
    const fixed = scoreUrgency(facts({ depart_date: "2026-09-15", date_flexibility: "fixed" }), NOW);
    const loose = scoreUrgency(
      facts({ depart_date: "2026-09-15", date_flexibility: "very_flexible" }),
      NOW
    );
    expect(fixed.score!).toBeGreaterThan(loose.score!);
  });
});

describe("scoreFit", () => {
  it("scores a new name low but says why", () => {
    const s = scoreFit(null);
    expect(s.score).toBe(15);
    expect(s.reason).toMatch(/new name/i);
  });

  it("rewards history, value and VIP", () => {
    const light = scoreFit(rel({ trips_count: 1, lifetime_value: 2000 }));
    const heavy = scoreFit(rel({ trips_count: 6, lifetime_value: 30000, tags: ["VIP"] }));
    expect(heavy.score!).toBeGreaterThan(light.score!);
    expect(heavy.reason).toMatch(/VIP/);
  });
});

describe("scoreEnquiry", () => {
  it("returns all four scores, each with a reason", () => {
    const s = scoreEnquiry(
      facts({ destination: "Lapland", depart_date: "2026-12-10", budget: 6500 }),
      rel({ trips_count: 2, lifetime_value: 9000 }),
      NOW
    );
    for (const key of ["likelihood", "value", "urgency", "fit"] as const) {
      expect(s[key].reason.length).toBeGreaterThan(5);
      expect(typeof s[key].score).toBe("number");
    }
  });
});
