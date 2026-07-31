import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { computeSuggestions } from "@/lib/suggest/detectors";
import { makeHousehold, makeContact, makeTrip, isoDaysFrom } from "@/lib/test/fixtures";
import type { Contact, Trip } from "@/lib/supabase/types";

const NOW = new Date("2026-07-23T12:00:00.000Z");

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW); // computeOpportunity reads Date.now()
});
afterEach(() => vi.useRealTimers());

const maps = (
  hhId: string,
  contacts: Contact[],
  trips: Trip[]
): [Map<string, Contact[]>, Map<string, Trip[]>] => [
  new Map([[hhId, contacts]]),
  new Map([[hhId, trips]]),
];

/** A household that books yearly and is due now: three returned trips at
 *  -24, -12 months, and last one 12 months ago. */
const dueTrips = (hhId: string): Trip[] =>
  [-36, -24, -12].map((m) =>
    makeTrip({
      household_id: hhId,
      stage: "returned",
      depart_date: isoDaysFrom(NOW, m * 30),
      total_value: 4000,
    })
  );

describe("rebooking window", () => {
  it("fires for a repeat customer inside their cadence with nothing planned", () => {
    const hh = makeHousehold({
      id: "hh1",
      display_name: "The Hartleys",
      lifetime_value: 12000,
      last_booking_at: isoDaysFrom(NOW, -360),
    });
    const [c, t] = maps("hh1", [makeContact({ household_id: "hh1" })], dueTrips("hh1"));
    const out = computeSuggestions([hh], c, t, NOW);
    const s = out.find((x) => x.kind === "rebooking_window");
    expect(s).toBeDefined();
    expect(s!.title).toMatch(/booking window/);
    expect(s!.reason).toMatch(/Nothing is planned/);
  });

  it("stays silent when there is already an open enquiry or travel ahead", () => {
    const hh = makeHousehold({ id: "hh1", last_booking_at: isoDaysFrom(NOW, -360) });
    const trips = [...dueTrips("hh1"), makeTrip({ household_id: "hh1", stage: "quoted" })];
    const [c, t] = maps("hh1", [makeContact({ household_id: "hh1" })], trips);
    const out = computeSuggestions([hh], c, t, NOW);
    expect(out.find((x) => x.kind === "rebooking_window")).toBeUndefined();
  });
});

describe("gone quiet", () => {
  it("fires for lapsed value and never doubles up with the rebooking window", () => {
    const hh = makeHousehold({
      id: "hh1",
      display_name: "The Pipers",
      lifetime_value: 18000,
      last_booking_at: isoDaysFrom(NOW, -30 * 20), // 20 months
    });
    // Only two dated trips, long ago — not enough for an opportunity score.
    const trips = [-40, -20].map((m) =>
      makeTrip({ household_id: "hh1", stage: "returned", depart_date: isoDaysFrom(NOW, m * 30) })
    );
    const [c, t] = maps("hh1", [makeContact({ household_id: "hh1" })], trips);
    const out = computeSuggestions([hh], c, t, NOW);
    const s = out.find((x) => x.kind === "gone_quiet");
    expect(s).toBeDefined();
    expect(s!.severity).toBe(2); // £15k+ lifts it
    expect(s!.reason).toMatch(/£18,000 lifetime value/);
    expect(out.filter((x) => x.householdId === "hh1" && (x.kind === "gone_quiet" || x.kind === "rebooking_window"))).toHaveLength(1);
  });

  it("ignores low-value or recent customers", () => {
    const recent = makeHousehold({ id: "hh1", lifetime_value: 20000, last_booking_at: isoDaysFrom(NOW, -90) });
    const cheap = makeHousehold({ id: "hh2", lifetime_value: 900, last_booking_at: isoDaysFrom(NOW, -700) });
    const out = computeSuggestions(
      [recent, cheap],
      new Map(),
      new Map(),
      NOW
    );
    expect(out.find((x) => x.kind === "gone_quiet")).toBeUndefined();
  });
});

describe("passport risk", () => {
  it("act-now when a passport expires before a booked trip", () => {
    const hh = makeHousehold({ id: "hh1", display_name: "The Slaters" });
    const trips = [
      makeTrip({ household_id: "hh1", stage: "booked", depart_date: isoDaysFrom(NOW, 40), destination: "Turkey" }),
    ];
    const contacts = [
      makeContact({ household_id: "hh1", first_name: "Gail", passport_expiry: isoDaysFrom(NOW, 20) }),
    ];
    const [c, t] = maps("hh1", contacts, trips);
    const out = computeSuggestions([hh], c, t, NOW);
    const s = out.find((x) => x.kind === "passport_risk");
    expect(s).toBeDefined();
    expect(s!.severity).toBe(3);
    expect(s!.reason).toMatch(/Gail/);
  });

  it("does not nag households with no travel ahead", () => {
    const hh = makeHousehold({ id: "hh1" });
    const contacts = [makeContact({ household_id: "hh1", passport_expiry: isoDaysFrom(NOW, 10) })];
    const [c, t] = maps("hh1", contacts, []);
    const out = computeSuggestions([hh], c, t, NOW);
    expect(out.find((x) => x.kind === "passport_risk")).toBeUndefined();
  });
});

describe("unreachable", () => {
  it("flags a household with contacts but no email or phone anywhere", () => {
    const hh = makeHousehold({ id: "hh1", display_name: "The Mystery Family" });
    const contacts = [
      makeContact({ household_id: "hh1", email: null, phone: null }),
      makeContact({ household_id: "hh1", email: null, phone: null, role: "partner" }),
    ];
    const [c, t] = maps("hh1", contacts, []);
    const out = computeSuggestions([hh], c, t, NOW);
    const s = out.find((x) => x.kind === "unreachable");
    expect(s).toBeDefined();
    expect(s!.severity).toBe(1);
  });

  it("escalates when they have live travel, stays quiet when reachable", () => {
    const hh = makeHousehold({ id: "hh1" });
    const trips = [makeTrip({ household_id: "hh1", stage: "booked", depart_date: isoDaysFrom(NOW, 10) })];
    const unreachable = computeSuggestions(
      [hh],
      new Map([["hh1", [makeContact({ household_id: "hh1", email: null, phone: null })]]]),
      new Map([["hh1", trips]]),
      NOW
    );
    expect(unreachable.find((x) => x.kind === "unreachable")!.severity).toBe(2);

    const reachable = computeSuggestions(
      [hh],
      new Map([["hh1", [makeContact({ household_id: "hh1", email: "a@b.com" })]]]),
      new Map([["hh1", trips]]),
      NOW
    );
    expect(reachable.find((x) => x.kind === "unreachable")).toBeUndefined();
  });
});

describe("ordering", () => {
  it("most urgent first", () => {
    const urgent = makeHousehold({ id: "hh1", display_name: "Urgent" });
    const mild = makeHousehold({ id: "hh2", display_name: "Mild", lifetime_value: 5000, last_booking_at: isoDaysFrom(NOW, -30 * 16) });
    const contacts = new Map([
      ["hh1", [makeContact({ household_id: "hh1", first_name: "Ann", passport_expiry: isoDaysFrom(NOW, 5) })]],
    ]);
    const trips = new Map([
      ["hh1", [makeTrip({ household_id: "hh1", stage: "booked", depart_date: isoDaysFrom(NOW, 30) })]],
    ]);
    const out = computeSuggestions([mild, urgent], contacts, trips, NOW);
    expect(out[0].kind).toBe("passport_risk");
    expect(out[0].severity).toBe(3);
  });
});

describe("undeliverable — the screen said sent, the customer heard nothing", () => {
  const bounce = (hhId: string, over: Partial<{ to_email: string; status: string }> = {}) =>
    new Map([
      [
        hhId,
        {
          household_id: hhId,
          to_email: "dead@example.com",
          status: "bounced",
          ...over,
        },
      ],
    ]);

  it("says plainly that they never received it, and names the address", () => {
    const hh = makeHousehold({ display_name: "The Whitfields" });
    const [c, t] = maps(hh.id, [makeContact({ household_id: hh.id })], []);
    const out = computeSuggestions([hh], c, t, NOW, bounce(hh.id));

    const s = out.find((x) => x.kind === "undeliverable")!;
    expect(s).toBeDefined();
    expect(s.title).toMatch(/never received/);
    expect(s.reason).toContain("dead@example.com");
    expect(s.reason).toMatch(/still waiting/);
  });

  it("is the most urgent thing on the list — someone is waiting on us", () => {
    const hh = makeHousehold();
    const [c, t] = maps(hh.id, [makeContact({ household_id: hh.id })], []);
    const out = computeSuggestions([hh], c, t, NOW, bounce(hh.id));
    expect(out.find((x) => x.kind === "undeliverable")!.severity).toBe(3);
  });

  it("a spam complaint reads differently from a dead address", () => {
    const hh = makeHousehold({ display_name: "The Patels" });
    const [c, t] = maps(hh.id, [makeContact({ household_id: hh.id })], []);
    const out = computeSuggestions([hh], c, t, NOW, bounce(hh.id, { status: "complained" }));

    const s = out.find((x) => x.kind === "undeliverable")!;
    expect(s.title).toMatch(/marked your email as spam/);
    expect(s.reason).toMatch(/nothing more will be sent/);
    expect(s.reason).not.toMatch(/bounced/);
  });

  it("says nothing when nothing bounced", () => {
    const hh = makeHousehold();
    const [c, t] = maps(hh.id, [makeContact({ household_id: hh.id })], []);
    expect(
      computeSuggestions([hh], c, t, NOW).find((x) => x.kind === "undeliverable")
    ).toBeUndefined();
  });
});
