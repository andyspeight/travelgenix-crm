import { describe, expect, it } from "vitest";
import { countHouseholdsForTokens, fetchHouseholdsForTokens } from "@/lib/segmentation/query";
import type { Token } from "@/lib/segmentation/parse";

/**
 * A tiny Supabase stand-in that records which tables were queried and whether
 * a query was head-only (a count). It does NOT emulate Postgres filtering — the
 * point of these tests is the control flow: that a count is head-only, that an
 * empty related-table match short-circuits without touching households, and
 * that the row fetch and the count run the same related-table lookups (they now
 * share one constraint builder, so they must never disagree).
 */
function mockDb(opts: { tripRows?: { household_id: string }[]; householdCount?: number; householdRows?: Record<string, unknown>[] }) {
  const calls: { table: string; head: boolean }[] = [];
  return {
    calls,
    from(table: string) {
      const state = { table, head: false };
      calls.push(state);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const builder: any = {};
      const chain = () => builder;
      for (const m of ["eq", "neq", "ilike", "gte", "lte", "in", "order", "limit", "not"]) builder[m] = chain;
      builder.select = (_cols: string, o?: { head?: boolean }) => {
        state.head = Boolean(o?.head);
        return builder;
      };
      builder.then = (resolve: (v: unknown) => unknown) => {
        if (table === "trips") return Promise.resolve({ data: opts.tripRows ?? [], error: null }).then(resolve);
        if (state.head) return Promise.resolve({ count: opts.householdCount ?? 0, error: null }).then(resolve);
        return Promise.resolve({ data: opts.householdRows ?? [], error: null }).then(resolve);
      };
      return builder;
    },
  };
}

const token = (filter: Token["filter"]): Token => ({ type: "value", label: "x", icon: "sparkles", filter });

describe("countHouseholdsForTokens", () => {
  it("returns the head count for column-only tokens, without touching trips", async () => {
    const db = mockDb({ householdCount: 5 });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const n = await countHouseholdsForTokens(db as any, "a1", [token({ kind: "ltv_min", amount: 1000 })]);
    expect(n).toBe(5);
    expect(db.calls.some((c) => c.table === "trips")).toBe(false);
    expect(db.calls.some((c) => c.table === "households" && c.head)).toBe(true);
  });

  it("counts through a related-table token when it matches some households", async () => {
    const db = mockDb({ tripRows: [{ household_id: "h1" }, { household_id: "h2" }], householdCount: 2 });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const n = await countHouseholdsForTokens(db as any, "a1", [token({ kind: "trip_stage", value: "booked" })]);
    expect(n).toBe(2);
    expect(db.calls.some((c) => c.table === "trips")).toBe(true);
    expect(db.calls.some((c) => c.table === "households" && c.head)).toBe(true);
  });

  it("short-circuits to 0 when a related-table token matches nothing (no households query)", async () => {
    const db = mockDb({ tripRows: [], householdCount: 99 });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const n = await countHouseholdsForTokens(db as any, "a1", [token({ kind: "destination", match: "Narnia" })]);
    expect(n).toBe(0);
    expect(db.calls.some((c) => c.table === "trips")).toBe(true);
    expect(db.calls.some((c) => c.table === "households")).toBe(false);
  });

  it("is head-only — it never selects household rows", async () => {
    const db = mockDb({ householdCount: 3 });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await countHouseholdsForTokens(db as any, "a1", [token({ kind: "city", match: "Poole" })]);
    const householdQueries = db.calls.filter((c) => c.table === "households");
    expect(householdQueries).toHaveLength(1);
    expect(householdQueries[0].head).toBe(true);
  });
});

describe("fetch and count agree on related-table lookups", () => {
  it("both run the trips lookup a destination token implies", async () => {
    const forFetch = mockDb({ tripRows: [{ household_id: "h1" }], householdRows: [{ id: "h1" }] });
    const forCount = mockDb({ tripRows: [{ household_id: "h1" }], householdCount: 1 });
    const tokens = [token({ kind: "destination", match: "Maldives" })];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await fetchHouseholdsForTokens(forFetch as any, "a1", tokens);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await countHouseholdsForTokens(forCount as any, "a1", tokens);

    expect(forFetch.calls.some((c) => c.table === "trips")).toBe(true);
    expect(forCount.calls.some((c) => c.table === "trips")).toBe(true);
    // The fetch selects rows (not head); the count is head-only.
    expect(forFetch.calls.some((c) => c.table === "households" && !c.head)).toBe(true);
    expect(forCount.calls.some((c) => c.table === "households" && c.head)).toBe(true);
  });
});
