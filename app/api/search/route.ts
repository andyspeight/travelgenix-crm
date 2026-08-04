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
  // Inside a PostgREST `.or(...)` the comma and parentheses are syntax, so
  // strip them from the value (a name/number never needs them anyway).
  const orSafe = safe.replace(/[(),]/g, " ");
  const supabase = createClient();
  const agencyId = await apiAgencyId();
  if (!agencyId) {
    return NextResponse.json(
      { ok: false, error: "No access to this workspace." },
      { status: 403 }
    );
  }

  const [{ data: households }, { data: trips }, { data: contacts }] = await Promise.all([
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
      .or(`destination.ilike.%${orSafe}%,reference.ilike.%${orSafe}%`)
      .limit(LIMIT),
    // The person, not just the household name: who someone actually is —
    // "who is 07700 900123?" — lives on contacts (email, phone, name).
    supabase
      .from("contacts")
      .select("household_id, first_name, last_name, email, phone")
      .eq("agency_id", agencyId)
      .or(
        `email.ilike.%${orSafe}%,phone.ilike.%${orSafe}%,first_name.ilike.%${orSafe}%,last_name.ilike.%${orSafe}%`
      )
      .limit(LIMIT * 2),
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
  const contactRows = (contacts ?? []) as {
    household_id: string;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    phone: string | null;
  }[];

  // A household can match by its own name OR by one of its people. Keep, per
  // household, the first matching contact — it's the "why this matched" line.
  const nameMatched = new Set(hh.map((h) => h.id));
  const contactByHh = new Map<string, (typeof contactRows)[number]>();
  for (const c of contactRows) {
    if (c.household_id && !contactByHh.has(c.household_id)) contactByHh.set(c.household_id, c);
  }
  const contactOnlyIds = Array.from(contactByHh.keys())
    .filter((id) => !nameMatched.has(id))
    .slice(0, LIMIT);

  // Pull the households matched only through a person, so they can be listed.
  let contactOnly: typeof hh = [];
  if (contactOnlyIds.length) {
    const { data } = await supabase
      .from("households")
      .select("id, display_name, city, household_type")
      .eq("agency_id", agencyId)
      .in("id", contactOnlyIds);
    contactOnly = (data ?? []) as typeof hh;
  }

  // "Jane Smith · 07700 900123" — the matched person and what they matched on.
  const whyMatched = (householdId: string): string | null => {
    const c = contactByHh.get(householdId);
    if (!c) return null;
    const name = [c.first_name, c.last_name].filter(Boolean).join(" ");
    const detail = c.email || c.phone || "";
    return [name, detail].filter(Boolean).join(" · ") || null;
  };

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

  // Name matches first (the strongest signal), then people-only matches.
  const customers = [...hh, ...contactOnly].slice(0, LIMIT).map((h) => {
    const why = nameMatched.has(h.id) ? null : whyMatched(h.id);
    return {
      id: h.id,
      name: h.display_name,
      sub: why ?? [h.city, h.household_type].filter(Boolean).join(" · "),
    };
  });

  return NextResponse.json({
    ok: true,
    customers,
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
