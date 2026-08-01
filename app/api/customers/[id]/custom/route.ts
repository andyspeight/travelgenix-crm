/**
 * PATCH /api/customers/[id]/custom — the custom field values on a customer.
 *
 * The browser sends whatever the form holds; this decides what may be written.
 * Unknown keys are dropped without comment, archived fields are refused for
 * editing, and every value is checked against its own definition before it
 * goes anywhere near the record (lib/custom-fields/schema).
 *
 * MERGED, NOT REPLACED. The incoming values are folded onto what is already
 * there, so a form that only rendered the fields on screen cannot wipe a
 * value it never showed — including anything held by a field that has since
 * been archived.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { apiAgencyId } from "@/lib/auth/session";
import { cleanValues, type CustomValues, type FieldDef } from "@/lib/custom-fields/schema";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  if (!UUID_RE.test(params.id ?? "")) {
    return NextResponse.json({ ok: false, error: "Invalid customer id" }, { status: 400 });
  }

  const agencyId = await apiAgencyId();
  if (!agencyId) {
    return NextResponse.json({ ok: false, error: "No access to this workspace." }, { status: 403 });
  }

  let body: { values?: unknown };
  try {
    body = (await request.json()) as { values?: unknown };
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const supabase = createClient();

  const [{ data: fieldRows }, { data: household }] = await Promise.all([
    supabase
      .from("custom_fields")
      .select("id, entity, key, label, type, options, help, position, archived")
      .eq("agency_id", agencyId)
      .eq("entity", "household"),
    supabase
      .from("households")
      .select("id, custom")
      .eq("agency_id", agencyId)
      .eq("id", params.id)
      .maybeSingle(),
  ]);

  if (!household) {
    return NextResponse.json({ ok: false, error: "Customer not found." }, { status: 404 });
  }

  const defs = (fieldRows ?? []) as FieldDef[];
  const { values, errors } = cleanValues(defs, body.values);

  if (errors.length > 0) {
    return NextResponse.json({ ok: false, error: errors.join(" ") }, { status: 400 });
  }

  const existing = (household.custom ?? {}) as CustomValues;
  const merged: CustomValues = { ...existing, ...values };

  const { data, error } = await supabase
    .from("households")
    .update({ custom: merged })
    .eq("id", params.id)
    .eq("agency_id", agencyId)
    .select("id, custom")
    .maybeSingle();

  if (error) {
    console.error("[customers/custom] update failed:", error.message);
    return NextResponse.json({ ok: false, error: "That didn't save." }, { status: 502 });
  }

  return NextResponse.json({ ok: true, custom: data?.custom ?? merged });
}
