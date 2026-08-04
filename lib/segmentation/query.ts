/**
 * Apply segmentation tokens to a Supabase query.
 *
 * Some tokens filter on `households` directly (LTV, household_type, city).
 * Others need to look at related tables (trips, interactions) — for those we
 * fetch the relevant ids first, then use `.in()` to narrow the household query.
 *
 * Day 5 optimisation: push more of this into a Postgres function so it runs
 * in one round-trip. For day 2 the multi-call approach is fine — we have 30
 * households, performance isn't a concern.
 */

import { SupabaseClient } from "@supabase/supabase-js";
import type { Token } from "./parse";
import type { Household } from "@/lib/supabase/types";

/**
 * The token → related-table id constraints, shared by the row fetch and the
 * count. Runs the trip lookups a token implies and returns:
 *   - the household-column filters to apply (as a callback), and
 *   - the intersected id set, or null when a token matched nothing.
 * Kept in one place so a segment's COUNT and its ROWS can never disagree.
 */
async function buildHouseholdConstraints(
  supabase: SupabaseClient,
  agencyId: string,
  tokens: Token[]
): Promise<{ applyColumnFilters: <Q>(q: Q) => Q; ids: string[] | null; empty: boolean }> {
  const idConstraints: string[][] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const columnFilters: ((q: any) => any)[] = [];

  for (const t of tokens) {
    const f = t.filter;

    if (f.kind === "ltv_min") {
      columnFilters.push((q) => q.gte("lifetime_value", f.amount));
    } else if (f.kind === "household_type") {
      columnFilters.push((q) => q.eq("household_type", f.value));
    } else if (f.kind === "city") {
      columnFilters.push((q) => q.ilike("city", `%${f.match}%`));
    } else if (f.kind === "no_contact_months") {
      const cutoff = new Date();
      cutoff.setMonth(cutoff.getMonth() - f.months);
      columnFilters.push((q) => q.lte("last_booking_at", cutoff.toISOString()));
    } else if (f.kind === "destination") {
      const { data } = await supabase
        .from("trips")
        .select("household_id")
        .eq("agency_id", agencyId)
        .ilike("destination", `%${f.match}%`);
      idConstraints.push((data ?? []).map((r: { household_id: string }) => r.household_id));
    } else if (f.kind === "trip_stage") {
      const { data } = await supabase
        .from("trips")
        .select("household_id")
        .eq("agency_id", agencyId)
        .eq("stage", f.value);
      idConstraints.push((data ?? []).map((r: { household_id: string }) => r.household_id));
    } else if (f.kind === "booked_year") {
      const start = `${f.year}-01-01`;
      const end = `${f.year}-12-31`;
      const { data } = await supabase
        .from("trips")
        .select("household_id")
        .eq("agency_id", agencyId)
        .gte("depart_date", start)
        .lte("depart_date", end)
        .neq("stage", "enquiry");
      idConstraints.push((data ?? []).map((r: { household_id: string }) => r.household_id));
    } else if (f.kind === "booked_in_last_months") {
      const cutoff = new Date();
      cutoff.setMonth(cutoff.getMonth() - f.months);
      const { data } = await supabase
        .from("trips")
        .select("household_id")
        .eq("agency_id", agencyId)
        .gte("depart_date", cutoff.toISOString().slice(0, 10))
        .neq("stage", "enquiry");
      idConstraints.push((data ?? []).map((r: { household_id: string }) => r.household_id));
    }
  }

  let ids: string[] | null = null;
  if (idConstraints.length > 0) {
    let intersect: string[] = idConstraints[0];
    for (let i = 1; i < idConstraints.length; i++) {
      const s = new Set(idConstraints[i]);
      intersect = intersect.filter((id) => s.has(id));
    }
    if (intersect.length === 0) return { applyColumnFilters: (q) => q, ids: [], empty: true };
    ids = intersect;
  }

  const applyColumnFilters = <Q>(q: Q): Q => {
    let out = q;
    for (const fn of columnFilters) out = fn(out);
    return out;
  };
  return { applyColumnFilters, ids, empty: false };
}

/**
 * How many households match these tokens — count only, no row payload.
 *
 * Used for the segment-chip badges on the Customers page. Fetching every
 * matching household's full row just to read `.length` (which the page used to
 * do, once per chip) moved a lot of data for a single number; this asks
 * Postgres for the count and transfers nothing else.
 */
export async function countHouseholdsForTokens(
  supabase: SupabaseClient,
  agencyId: string,
  tokens: Token[]
): Promise<number> {
  const { applyColumnFilters, ids, empty } = await buildHouseholdConstraints(supabase, agencyId, tokens);
  if (empty) return 0;

  let query = applyColumnFilters(
    supabase.from("households").select("id", { count: "exact", head: true }).eq("agency_id", agencyId)
  );
  if (ids) query = query.in("id", ids);

  const { count, error } = await query;
  if (error) {
    console.error("[countHouseholdsForTokens]", error);
    return 0;
  }
  return count ?? 0;
}

export async function fetchHouseholdsForTokens(
  supabase: SupabaseClient,
  agencyId: string,
  tokens: Token[]
): Promise<Household[]> {
  const { applyColumnFilters, ids, empty } = await buildHouseholdConstraints(supabase, agencyId, tokens);
  if (empty) return [];

  let query = applyColumnFilters(
    supabase.from("households").select("*").eq("agency_id", agencyId)
  );
  if (ids) query = query.in("id", ids);

  const { data, error } = await query.order("display_name");
  if (error) {
    console.error("[fetchHouseholdsForTokens]", error);
    return [];
  }

  return (data ?? []) as Household[];
}
