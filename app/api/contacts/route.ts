/**
 * POST /api/contacts — add a traveller to a household.
 *
 * The other half of the missing write path: an agent on the phone gets a
 * second passenger's details and needs somewhere to put them.
 *
 * The household is re-read scoped to the agency before anything is inserted,
 * so a household id from another workspace resolves to nothing and the add is
 * refused — a contact can never be attached across a tenant boundary.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { apiAgencyId } from "@/lib/auth/session";
import { validateContact } from "@/lib/contacts/validate";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  const agencyId = await apiAgencyId();
  if (!agencyId) {
    return NextResponse.json({ ok: false, error: "No access to this workspace." }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const householdId = typeof body.household_id === "string" ? body.household_id : "";
  if (!UUID_RE.test(householdId)) {
    return NextResponse.json({ ok: false, error: "Which customer is this traveller for?" }, { status: 400 });
  }

  const validated = validateContact(body, true);
  if (!validated.ok) {
    return NextResponse.json({ ok: false, error: validated.error }, { status: 400 });
  }

  const supabase = createClient();

  // The household is the authorisation: not ours, not here.
  const { data: household } = await supabase
    .from("households")
    .select("id")
    .eq("agency_id", agencyId)
    .eq("id", householdId)
    .maybeSingle();
  if (!household) {
    return NextResponse.json({ ok: false, error: "That customer isn't in this workspace." }, { status: 404 });
  }

  const { data, error } = await supabase
    .from("contacts")
    .insert({ agency_id: agencyId, household_id: householdId, ...validated.patch })
    .select(
      "id, household_id, role, first_name, last_name, email, phone, date_of_birth, passport_expiry, passport_country, dietary, flags"
    )
    .maybeSingle();

  if (error) {
    console.error("[contacts] insert failed:", error.message);
    return NextResponse.json({ ok: false, error: "That traveller couldn't be saved." }, { status: 502 });
  }

  return NextResponse.json({ ok: true, contact: data });
}
