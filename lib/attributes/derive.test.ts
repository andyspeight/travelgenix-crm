import { describe, expect, it } from "vitest";
import {
  deriveAttributes,
  hasAttribute,
  describeFilter,
  ATTRIBUTES,
  type DeriveInput,
} from "@/lib/attributes/derive";

const NOW = new Date("2026-08-01T12:00:00.000Z");

const input = (over: Partial<DeriveInput> = {}): DeriveInput => ({
  now: NOW,
  household: { trips_count: 3, last_booking_at: "2026-01-01", lifetime_value: 12000 },
  contacts: [{ first_name: "Rachel", email: "rachel@example.com", phone: "07700 900000", passport_expiry: "2030-01-01" }],
  trips: [],
  lastContactAt: "2026-07-20",
  hasLiveQuote: false,
  emailSuppressed: false,
  marketingConsent: "granted",
  ...over,
});

const ids = (i: DeriveInput) => deriveAttributes(i).map((a) => a.id);

describe("where they are", () => {
  it("spots a departure inside the month, with the date", () => {
    const attrs = deriveAttributes(
      input({ trips: [{ stage: "booked", depart_date: "2026-08-20", return_date: "2026-08-30", destination: "Crete" }] })
    );
    const departing = attrs.find((a) => a.id === "departing_soon")!;
    expect(departing.reason).toMatch(/leaves in 19 days/);
    expect(departing.reason).toMatch(/20 Aug 2026/);
  });

  it("ignores a departure months out", () => {
    expect(
      ids(input({ trips: [{ stage: "booked", depart_date: "2026-12-01", destination: "Crete" }] }))
    ).not.toContain("departing_soon");
  });

  it("knows when someone is away right now", () => {
    const attrs = deriveAttributes(
      input({ trips: [{ stage: "travelling", destination: "Crete", return_date: "2026-08-10" }] })
    );
    expect(attrs.find((a) => a.id === "travelling_now")!.reason).toMatch(/In Crete now, back 10 Aug/);
  });
});

describe("passports, measured against the trip they are taking", () => {
  const withTrip = (over: Partial<DeriveInput> = {}) =>
    input({
      trips: [{ stage: "booked", depart_date: "2026-09-01", return_date: "2026-09-14", destination: "Crete" }],
      ...over,
    });

  it("flags a passport inside the six-month margin, and says whose", () => {
    const attrs = deriveAttributes(
      withTrip({ contacts: [{ first_name: "Sam", passport_expiry: "2026-12-01" }] })
    );
    const risk = attrs.find((a) => a.id === "passport_risk")!;
    expect(risk.reason).toMatch(/Sam's expires 1 Dec 2026/);
    expect(risk.reason).toMatch(/six months/);
  });

  it("stays quiet when the margin is comfortable", () => {
    expect(ids(withTrip({ contacts: [{ first_name: "Sam", passport_expiry: "2030-01-01" }] }))).not.toContain(
      "passport_risk"
    );
  });

  it("calls a missing passport what it is, not a risk", () => {
    const attrs = ids(withTrip({ contacts: [{ first_name: "Sam", passport_expiry: null }] }));
    expect(attrs).toContain("passport_unknown");
    expect(attrs).not.toContain("passport_risk");
  });

  it("says nothing about passports when there is no trip to measure against", () => {
    const attrs = ids(input({ contacts: [{ first_name: "Sam", passport_expiry: null }] }));
    expect(attrs).not.toContain("passport_unknown");
    expect(attrs).not.toContain("passport_risk");
  });
});

describe("whether we can reach them", () => {
  it("flags a household with no way to contact it", () => {
    expect(ids(input({ contacts: [{ first_name: "Sam", email: null, phone: null }] }))).toContain("unreachable");
  });

  it("flags a bouncing address even though one is on file", () => {
    const attrs = deriveAttributes(input({ emailSuppressed: true }));
    expect(attrs.find((a) => a.id === "unreachable")!.reason).toMatch(/bounced/);
  });

  it("separates refused from never asked", () => {
    expect(
      deriveAttributes(input({ marketingConsent: "refused" })).find((a) => a.id === "no_marketing_consent")!.reason
    ).toMatch(/refused/);
    expect(
      deriveAttributes(input({ marketingConsent: "unknown" })).find((a) => a.id === "no_marketing_consent")!.reason
    ).toMatch(/No marketing consent recorded/);
  });

  it("says nothing when consent is granted", () => {
    expect(ids(input())).not.toContain("no_marketing_consent");
  });
});

describe("silence and opportunity", () => {
  it("counts the months since anyone spoke, and says the date", () => {
    const attrs = deriveAttributes(input({ lastContactAt: "2026-01-05" }));
    const quiet = attrs.find((a) => a.id === "gone_quiet")!;
    expect(quiet.reason).toMatch(/since 5 Jan 2026/);
    expect(quiet.reason).toMatch(/6 months/);
  });

  it("is not 'gone quiet' when they have a trip coming up", () => {
    expect(
      ids(
        input({
          lastContactAt: "2026-01-05",
          trips: [{ stage: "booked", depart_date: "2026-10-01" }],
        })
      )
    ).not.toContain("gone_quiet");
  });

  it("spots the rebooking window", () => {
    const attrs = deriveAttributes(input({ household: { trips_count: 2, last_booking_at: "2025-09-01" } }));
    expect(attrs.find((a) => a.id === "rebooking_window")!.reason).toMatch(/11 months ago/);
  });

  it("leaves someone who booked last month alone", () => {
    expect(ids(input({ household: { trips_count: 2, last_booking_at: "2026-07-01" } }))).not.toContain(
      "rebooking_window"
    );
  });

  it("leaves someone who booked years ago alone too", () => {
    expect(ids(input({ household: { trips_count: 2, last_booking_at: "2022-01-01" } }))).not.toContain(
      "rebooking_window"
    );
  });

  it("notices a customer who has never actually travelled", () => {
    expect(ids(input({ household: { trips_count: 0 } }))).toContain("never_travelled");
  });

  it("notices a quote sitting with them", () => {
    expect(ids(input({ hasLiveQuote: true }))).toContain("open_quote");
  });
});

describe("every attribute explains itself", () => {
  it("gives a reason built from real values, never a bare label", () => {
    const attrs = deriveAttributes(
      input({
        trips: [{ stage: "booked", depart_date: "2026-08-15", return_date: "2026-08-29", destination: "Crete" }],
        contacts: [{ first_name: "Sam", passport_expiry: "2026-10-01" }],
      })
    );
    expect(attrs.length).toBeGreaterThan(0);
    for (const a of attrs) {
      expect(a.reason.length).toBeGreaterThan(20);
      expect(a.label.length).toBeGreaterThan(2);
    }
  });

  it("describes how every filter is worked out, so none is a mystery", () => {
    for (const def of ATTRIBUTES) {
      expect(def.description.length).toBeGreaterThan(20);
    }
  });

  it("says what an empty result means rather than showing nothing", () => {
    expect(describeFilter("passport_risk", 0)).toMatch(/Nobody is passport risk right now/);
    expect(describeFilter("passport_risk", 3)).toMatch(/3 customers/);
  });

  it("finds nothing to say about a quiet, well-recorded customer", () => {
    expect(hasAttribute(deriveAttributes(input()), "gone_quiet")).toBe(false);
    expect(ids(input())).toEqual([]);
  });
});
