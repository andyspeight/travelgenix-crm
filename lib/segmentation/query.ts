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

export async function fetchHouseholdsForTokens(
  supabase: SupabaseClient,
  agencyId: string,
  tokens: Token[]
): Promise<Household[]> {
  let query = supabase
    .from("households")
    .select("*")
    .eq("agency_id", agencyId);

  // We collect id constraints from related-table tokens, then intersect once.
  const idConstraints: string[][] = [];

  for (const t of tokens) {
    const f = t.filter;

    if (f.kind === "ltv_min") {
      query = query.gte("lifetime_value", f.amount);
    } else if (f.kind === "household_type") {
      query = query.eq("household_type", f.value);
    } else if (f.kind === "city") {
      query = query.ilike("city", `%${f.match}%`);
    } else if (f.kind === "no_contact_months") {
      const cutoff = new Date();
      cutoff.setMonth(cutoff.getMonth() - f.months);
      query = query.lte("last_booking_at", cutoff.toISOString());
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

  // Intersect all id constraints down to a single set
  if (idConstraints.length > 0) {
    let intersect: string[] = idConstraints[0];
    for (let i = 1; i < idConstraints.length; i++) {
      const s = new Set(idConstraints[i]);
      intersect = intersect.filter((id) => s.has(id));
    }
    if (intersect.length === 0) return [];
    query = query.in("id", intersect);
  }

  const { data, error } = await query.order("display_name");
  if (error) {
    console.error("[fetchHouseholdsForTokens]", error);
    return [];
  }

  return (data ?? []) as Household[];
}
