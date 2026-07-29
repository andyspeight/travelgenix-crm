/**
 * GET /api/search?q=...
 *
 * Powers the Quick-find command palette. Returns a small set of matching
 * customers and trips for a short query. Agency-scoped, read-only, length-capped.
 * Navigation targets only (ids + labels), never full records.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { apiAgencyId } from "@/lib/auth/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_Q = 60;
const LIMIT = 6;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, MAX_Q);
  if (!q) return NextResponse.json({ ok: true, customers: [], trips: [] });

  // Escape the LIKE wildcards a user might type so they match literally.
  const safe = q.replace(/[%_]/g, (m) => `\\${m}`);
  const supabase = createClient();
  const agencyId = await apiAgencyId();
  if (!agencyId) {
    return NextResponse.json(
      { ok: false, error: "No access to this workspace." },
      { status: 403 }
    );
  }

  const [{ data: households }, { data: trips }] = await Promise.all([
    supabase
      .from("households")
      .select("id, display_name, city, household_type")
      .eq("agency_id", agencyId)
      .ilike("display_name", `%${safe}%`)
      .limit(LIMIT),
    supabase
      .from("trips")
      .select("id, household_id, destination, destination_country, stage, reference")
      .eq("agency_id", agencyId)
      .or(`destination.ilike.%${safe}%,reference.ilike.%${safe}%`)
      .limit(LIMIT),
  ]);

  const hh = (households ?? []) as {
    id: string;
    display_name: string;
    city: string | null;
    household_type: string | null;
  }[];
  const tr = (trips ?? []) as {
    id: string;
    household_id: string;
    destination: string | null;
    destination_country: string | null;
    stage: string;
    reference: string | null;
  }[];

  // Resolve household names for the matched trips (one query).
  const tripHouseholdIds = Array.from(new Set(tr.map((t) => t.household_id))).filter(Boolean);
  let nameById: Record<string, string> = {};
  if (tripHouseholdIds.length) {
    const { data: names } = await supabase
      .from("households")
      .select("id, display_name")
      .in("id", tripHouseholdIds);
    nameById = Object.fromEntries(
      (names ?? []).map((n: { id: string; display_name: string }) => [n.id, n.display_name])
    );
  }

  return NextResponse.json({
    ok: true,
    customers: hh.map((h) => ({
      id: h.id,
      name: h.display_name,
      sub: [h.city, h.household_type].filter(Boolean).join(" · "),
    })),
    trips: tr.map((t) => ({
      id: t.id,
      householdId: t.household_id,
      dest: t.destination ?? "Trip",
      country: t.destination_country,
      sub: [nameById[t.household_id], t.stage?.replace("_", " "), t.reference]
        .filter(Boolean)
        .join(" · "),
    })),
  });
}
