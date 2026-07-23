import { describe, expect, it } from "vitest";
import { computeTravelMemory, type MemoryFact } from "@/lib/memory/travel-memory";
import { makeHousehold, makeContact, makeTrip, isoDaysFrom } from "@/lib/test/fixtures";
import type { Quote } from "@/lib/supabase/types";

const NOW = new Date("2026-07-23T12:00:00.000Z");

const compute = (over: Partial<Parameters<typeof computeTravelMemory>[0]> = {}) =>
  computeTravelMemory({
    household: makeHousehold({ id: "hh1" }),
    contacts: [],
    trips: [],
    preferences: [],
    quotes: [],
    now: NOW,
    ...over,
  });

const byCat = (facts: MemoryFact[], cat: string) => facts.filter((f) => f.category === cat);

describe("computeTravelMemory", () => {
  it("says nothing when there is nothing honest to say", () => {
    expect(compute()).toHaveLength(0);
  });

  it("every fact carries a citation", () => {
    const facts = compute({
      contacts: [makeContact({ household_id: "hh1", dietary: "nut allergy" })],
      trips: [
        makeTrip({ stage: "returned", destination: "Crete", depart_date: isoDaysFrom(NOW, -400), total_value: 3000, duration_nights: 7 }),
        makeTrip({ stage: "returned", destination: "Crete", depart_date: isoDaysFrom(NOW, -30), total_value: 5000, duration_nights: 7 }),
      ],
    });
    expect(facts.length).toBeGreaterThan(0);
    for (const f of facts) {
      expect(f.source.length).toBeGreaterThan(3);
    }
  });

  it("counts repeat destinations and cites the trip history", () => {
    const facts = compute({
      trips: [
        makeTrip({ stage: "returned", destination: "Tenerife", destination_country: "Spain", depart_date: isoDaysFrom(NOW, -700) }),
        makeTrip({ stage: "returned", destination: "Tenerife", destination_country: "Spain", depart_date: isoDaysFrom(NOW, -350) }),
        makeTrip({ stage: "returned", destination: "Rome", destination_country: "Italy", depart_date: isoDaysFrom(NOW, -100) }),
      ],
    });
    const places = byCat(facts, "places");
    expect(places[0].text).toMatch(/Tenerife \(×2\)/);
    expect(places[0].source).toMatch(/3 completed trips/);
    expect(places.find((f) => f.text.includes("Returns to Spain"))).toBeDefined();
  });

  it("averages spend over priced bookings only", () => {
    const facts = compute({
      trips: [
        makeTrip({ stage: "returned", total_value: 2000, depart_date: isoDaysFrom(NOW, -400) }),
        makeTrip({ stage: "booked", total_value: 6000, depart_date: isoDaysFrom(NOW, 60) }),
        makeTrip({ stage: "enquiry", total_value: 99999 }), // never counted
      ],
    });
    const m = byCat(facts, "money")[0];
    expect(m.text).toMatch(/around £4,000 a trip/);
    expect(m.text).toMatch(/biggest booking £6,000/);
    expect(m.source).toMatch(/2 priced bookings/);
  });

  it("reads cadence and favoured months from departure dates", () => {
    const facts = compute({
      trips: [-24, -12, 0].map((m) =>
        makeTrip({
          stage: m === 0 ? "booked" : "returned",
          depart_date: `202${m === -24 ? 4 : m === -12 ? 5 : 6}-08-10`,
        })
      ),
    });
    const rhythm = byCat(facts, "rhythm");
    expect(rhythm.find((f) => f.text.match(/every 12 months/))).toBeDefined();
    expect(rhythm.find((f) => f.text.match(/usually travels in August/i))).toBeDefined();
  });

  it("describes the party with children's ages from DOBs", () => {
    const facts = compute({
      contacts: [
        makeContact({ household_id: "hh1", role: "lead" }),
        makeContact({ household_id: "hh1", role: "partner" }),
        makeContact({ household_id: "hh1", role: "child", date_of_birth: "2018-01-15" }),
      ],
    });
    const party = byCat(facts, "party")[0];
    expect(party.text).toMatch(/2 adults and 1 child \(children 8\)/);
    expect(party.source).toBe("household record");
  });

  it("shows preference provenance, including Luna's inferences with confidence", () => {
    const facts = compute({
      preferences: [
        { category: "airline", value: "BA", source: "manual" },
        { category: "room", value: "sea view", source: "inferred", confidence: 0.7 },
      ],
    });
    const tastes = byCat(facts, "tastes");
    expect(tastes[0].source).toBe("recorded preference");
    expect(tastes[1].source).toMatch(/inferred by Luna \(70% confidence\)/);
  });

  it("keeps the most recent quote decline as a watch-out", () => {
    const quote = (over: Partial<Quote>): Quote =>
      ({
        id: "q1",
        agency_id: "a",
        trip_id: "t",
        household_id: "hh1",
        reference: null,
        version: 1,
        status: "declined",
        total_price: 4800,
        deposit: null,
        expected_margin: null,
        currency: "GBP",
        options_summary: null,
        sent_at: null,
        expires_at: null,
        viewed_at: null,
        view_count: 0,
        customer_response: null,
        declined_reason: null,
        notes: null,
        created_at: "2026-05-01T00:00:00.000Z",
        updated_at: "2026-05-01T00:00:00.000Z",
        ...over,
      }) as Quote;

    const facts = compute({
      quotes: [
        quote({ id: "old", declined_reason: "too expensive", updated_at: "2026-03-01T00:00:00.000Z" }),
        quote({ id: "new", declined_reason: "booked elsewhere", updated_at: "2026-06-01T00:00:00.000Z", version: 2 }),
      ],
    });
    const w = byCat(facts, "watchouts");
    expect(w[0].text).toMatch(/"booked elsewhere" \(Jun 2026\)/);
    expect(w[0].source).toMatch(/quote v2 at £4,800/);
  });
});
