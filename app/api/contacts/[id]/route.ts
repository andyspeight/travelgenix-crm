/**
 * PATCH /api/contacts/[id] — edit a traveller.
 *
 * The write path the usability review found missing: passport expiry, date of
 * birth, dietary needs, flags, name, role and contact details, all of which
 * the app could show and none of which it could enter or correct.
 *
 * Scoped to the agency on the update itself, so a contact id from another
 * workspace cannot be touched even if it were guessed. The full passport
 * NUMBER is deliberately not accepted here (see lib/contacts/validate).
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { apiAgencyId } from "@/lib/auth/session";
import { validateContact } from "@/lib/contacts/validate";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  if (!UUID_RE.test(params.id ?? "")) {
    return NextResponse.json({ ok: false, error: "Invalid traveller id" }, { status: 400 });
  }

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

  const validated = validateContact(body, false);
  if (!validated.ok) {
    return NextResponse.json({ ok: false, error: validated.error }, { status: 400 });
  }
  if (Object.keys(validated.patch).length === 0) {
    return NextResponse.json({ ok: false, error: "Nothing to change." }, { status: 400 });
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from("contacts")
    .update({ ...validated.patch, updated_at: new Date().toISOString() })
    .eq("id", params.id)
    .eq("agency_id", agencyId)
    .select(
      "id, household_id, role, first_name, last_name, email, phone, date_of_birth, passport_expiry, passport_country, dietary, flags"
    )
    .maybeSingle();

  if (error) {
    console.error("[contacts] update failed:", error.message);
    return NextResponse.json({ ok: false, error: "That didn't save." }, { status: 502 });
  }
  if (!data) {
    return NextResponse.json({ ok: false, error: "Traveller not found." }, { status: 404 });
  }

  return NextResponse.json({ ok: true, contact: data });
}
