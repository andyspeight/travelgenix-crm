/**
 * POST /api/customers
 *
 * Creates a household plus its lead contact — the "Add customer" flow. The
 * minimum viable record is a display name and a lead first name; everything
 * else is optional and can be filled in later on the record.
 *
 * Agency-scoped. If the contact insert fails after the household was created,
 * the household is removed again so no half-record is left behind.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { apiAgencyId } from "@/lib/auth/session";
import { emitEvent } from "@/lib/events/emit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HOUSEHOLD_TYPES = new Set(["family", "couple", "solo", "group"]);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Body = {
  display_name?: unknown;
  household_type?: unknown;
  address_line1?: unknown;
  address_line2?: unknown;
  city?: unknown;
  county?: unknown;
  postcode?: unknown;
  lead?: { first_name?: unknown; last_name?: unknown; email?: unknown; phone?: unknown };
};

const str = (v: unknown, max: number): string | null =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;

export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const displayName = str(body.display_name, 120);
  if (!displayName) {
    return NextResponse.json({ ok: false, error: "A customer name is required" }, { status: 400 });
  }

  const householdType =
    typeof body.household_type === "string" && HOUSEHOLD_TYPES.has(body.household_type)
      ? body.household_type
      : null;
  const city = str(body.city, 80);
  const addressLine1 = str(body.address_line1, 120);
  const addressLine2 = str(body.address_line2, 120);
  const county = str(body.county, 80);
  const postcode = str(body.postcode, 16);

  const firstName = str(body.lead?.first_name, 60);
  if (!firstName) {
    return NextResponse.json({ ok: false, error: "The lead contact's first name is required" }, { status: 400 });
  }
  const lastName = str(body.lead?.last_name, 60);
  const email = str(body.lead?.email, 120);
  if (email && !EMAIL_RE.test(email)) {
    return NextResponse.json({ ok: false, error: "That email address doesn't look right" }, { status: 400 });
  }
  const phone = str(body.lead?.phone, 40);

  const supabase = createClient();
  const agencyId = await apiAgencyId();
  if (!agencyId) {
    return NextResponse.json(
      { ok: false, error: "No access to this workspace." },
      { status: 403 }
    );
  }
  const nowIso = new Date().toISOString();

  const { data: household, error: hhErr } = await supabase
    .from("households")
    .insert({
      agency_id: agencyId,
      display_name: displayName,
      household_type: householdType,
      address_line1: addressLine1,
      address_line2: addressLine2,
      city,
      county,
      postcode,
      tags: [],
      lifetime_value: 0,
      trips_count: 0,
      customer_since: nowIso.slice(0, 10),
    })
    .select("id")
    .maybeSingle();

  if (hhErr || !household) {
    return NextResponse.json({ ok: false, error: hhErr?.message ?? "Couldn't create the customer" }, { status: 500 });
  }

  const householdId = (household as { id: string }).id;

  const { error: contactErr } = await supabase.from("contacts").insert({
    agency_id: agencyId,
    household_id: householdId,
    role: "lead",
    first_name: firstName,
    last_name: lastName,
    email,
    phone,
    flags: [],
    marketing_opt_in: false,
    gdpr_consent: false,
  });

  if (contactErr) {
    // Don't leave a contactless half-record behind.
    await supabase.from("households").delete().eq("id", householdId).eq("agency_id", agencyId);
    return NextResponse.json({ ok: false, error: contactErr.message }, { status: 500 });
  }

  await emitEvent(supabase, agencyId, {
    type: "customer.created",
    subjectType: "household",
    subjectId: householdId,
    householdId,
    payload: { source: "manual_add" },
  });

  return NextResponse.json({ ok: true, id: householdId });
}
