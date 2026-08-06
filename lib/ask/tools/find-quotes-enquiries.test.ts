import { describe, expect, it } from "vitest";
import { findQuotes } from "@/lib/ask/tools/find-quotes";
import { findEnquiries } from "@/lib/ask/tools/find-enquiries";
import { findTool } from "@/lib/ask/registry";
import { fakeDb } from "@/lib/test/fake-db";
import { makeHousehold, isoDaysFrom } from "@/lib/test/fixtures";
import type { QueryContext } from "@/lib/ask/contract";

const NOW = new Date("2026-08-06T12:00:00.000Z");
function ctx(db: ReturnType<typeof fakeDb>): QueryContext {
  return { agencyId: "a1", db, now: NOW };
}

describe("find_quotes", () => {
  it("is registered", () => {
    expect(findTool("find_quotes")?.name).toBe("find_quotes");
  });

  it("answers 'quotes over £5000 still unaccepted': totals, flags expiring, biggest first", async () => {
    const db = fakeDb({
      quotes: [
        { id: "q1", household_id: "h1", reference: "Q-1", status: "sent", total_price: 12000, sent_at: isoDaysFrom(NOW, -2), expires_at: isoDaysFrom(NOW, 3) },
        { id: "q2", household_id: "h2", reference: "Q-2", status: "viewed", total_price: 7000, sent_at: isoDaysFrom(NOW, -5), expires_at: isoDaysFrom(NOW, 30) },
      ],
      households: [makeHousehold({ id: "h1", display_name: "Ahmed Family" }), makeHousehold({ id: "h2", display_name: "Bell Household" })],
    });

    const r = await findQuotes.run({ min_value: 5000, status_group: "open" }, ctx(db));
    expect(r.shape).toBe("list");
    expect(r.rows?.map((x) => x.id)).toEqual(["h1", "h2"]); // value_desc
    expect(r.summary).toMatch(/2 quotes still open, worth over £5,000 \(£19,000 total\)/);
    expect(r.rows?.[0].badges).toContain("Expiring soon");
    const kinds = r.signals.map((s) => s.kind);
    expect(kinds).toContain("set_value");
    expect(kinds).toContain("top_quote");
    expect(kinds).toContain("expiring_soon");
    expect(r.signals.find((s) => s.kind === "top_quote")?.detail).toMatch(/£12k.*Ahmed Family/);
  });

  it("handles unlinked quotes and an empty result", async () => {
    const db1 = fakeDb({
      quotes: [{ id: "q9", household_id: null, reference: "Q-9", status: "declined", total_price: 15000, sent_at: null, expires_at: null }],
      households: [],
    });
    const r1 = await findQuotes.run({ min_value: 10000, status_group: "declined" }, ctx(db1));
    expect(r1.rows?.[0]).toMatchObject({ id: "q9", href: "/quotes", title: "Unlinked quote" });
    expect(r1.summary).toMatch(/declined, worth over £10,000/);

    const db2 = fakeDb({ quotes: [], households: [] });
    const r2 = await findQuotes.run({ min_value: 999999 }, ctx(db2));
    expect(r2.shape).toBe("empty");
    expect(r2.summary).toMatch(/no quotes match worth over £999,999/i);
  });
});

describe("find_enquiries", () => {
  it("is registered", () => {
    expect(findTool("find_enquiries")?.name).toBe("find_enquiries");
  });

  it("answers 'enquiries with budget over £8000 awaiting a response'", async () => {
    const db = fakeDb({
      enquiries: [
        { id: "en1", household_id: null, status: "new", contact_name: "Sarah Jones", destination: "Maldives", depart_date: isoDaysFrom(NOW, 60), budget: 12000, budget_basis: "total", received_at: isoDaysFrom(NOW, -1) },
        { id: "en2", household_id: "h2", status: "new", contact_name: "Tom Wilson", destination: "Greece", depart_date: isoDaysFrom(NOW, 90), budget: 9000, budget_basis: "per_person", received_at: isoDaysFrom(NOW, -2) },
      ],
      households: [makeHousehold({ id: "h2", display_name: "Wilson Family" })],
    });

    const r = await findEnquiries.run({ min_value: 8000, status_group: "awaiting" }, ctx(db));
    expect(r.shape).toBe("list");
    expect(r.rows?.map((x) => x.id)).toEqual(["en1", "h2"]); // value_desc; en1 unlinked uses its own id
    expect(r.rows?.[0].title).toBe("Sarah Jones");
    expect(r.rows?.[1].title).toBe("Wilson Family");
    expect(r.rows?.[1].subtitle).toMatch(/£9\.0k pp/);
    expect(r.summary).toMatch(/2 enquiries awaiting a response, budget over £8,000 \(£21,000 of budget\)/);
    expect(r.signals.find((s) => s.kind === "top_enquiry")?.detail).toMatch(/£12k.*Sarah Jones.*Maldives/);
    // group is "awaiting" so no redundant awaiting_response signal
    expect(r.signals.map((s) => s.kind)).not.toContain("awaiting_response");
  });

  it("filters by destination in code and flags still-awaiting when not the filter", async () => {
    const db = fakeDb({
      enquiries: [
        { id: "en1", household_id: null, status: "new", contact_name: "A", destination: "Crete, Greece", depart_date: null, budget: 6000, budget_basis: "total", received_at: isoDaysFrom(NOW, -1) },
        { id: "en2", household_id: null, status: "responded", contact_name: "B", destination: "Rome", depart_date: null, budget: 5000, budget_basis: "total", received_at: isoDaysFrom(NOW, -1) },
      ],
      households: [],
    });
    const r = await findEnquiries.run({ min_value: 1000, destination: "greece", status_group: "open" }, ctx(db));
    expect(r.rows?.map((x) => x.id)).toEqual(["en1"]);
    expect(r.summary).toMatch(/still open, to greece, budget over £1,000/);
    expect(r.signals.find((s) => s.kind === "awaiting_response")?.detail).toMatch(/1 of these is still awaiting/);
  });
});
