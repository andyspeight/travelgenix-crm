/**
 * /api/custom-fields — the fields this agency has added.
 *
 * GET   → every field, archived ones included, in the agency's own order.
 * POST  → a new field.
 *
 * A field's TYPE is set once and never changed. Turning a text field into a
 * number would quietly reinterpret every value already recorded under it, and
 * "approx 3" would become nothing without anybody being told. The PATCH route
 * (per id) allows the label, the help text, the options and the position to
 * move; to change a type you make a new field.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { apiAgencyId } from "@/lib/auth/session";
import { validateDef, MAX_FIELDS_PER_ENTITY, type FieldDef } from "@/lib/custom-fields/schema";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const agencyId = await apiAgencyId();
  if (!agencyId) {
    return NextResponse.json({ ok: false, error: "No access to this workspace." }, { status: 403 });
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from("custom_fields")
    .select("id, entity, key, label, type, options, help, position, archived")
    .eq("agency_id", agencyId)
    .order("position");

  if (error) {
    // The table arrives with a migration; without it the app simply has no
    // custom fields, which is a state it handles.
    return NextResponse.json({ ok: true, fields: [], migrationMissing: true });
  }

  return NextResponse.json({ ok: true, fields: (data ?? []) as FieldDef[] });
}

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

  const supabase = createClient();
  const { data: existing } = await supabase
    .from("custom_fields")
    .select("key, position")
    .eq("agency_id", agencyId)
    .eq("entity", "household");

  const rows = (existing ?? []) as { key: string; position: number }[];

  // A ceiling, because a form nobody can face is a form nobody fills in.
  if (rows.length >= MAX_FIELDS_PER_ENTITY) {
    return NextResponse.json(
      {
        ok: false,
        error: `That's ${MAX_FIELDS_PER_ENTITY} custom fields already. Archive one you no longer use before adding another.`,
      },
      { status: 400 }
    );
  }

  const validated = validateDef(body, rows.map((r) => r.key));
  if (!validated.ok) {
    return NextResponse.json({ ok: false, error: validated.error }, { status: 400 });
  }

  const position = rows.reduce((max, r) => Math.max(max, r.position), 0) + 1;

  const { data, error } = await supabase
    .from("custom_fields")
    .insert({
      agency_id: agencyId,
      entity: "household",
      key: validated.def.key,
      label: validated.def.label,
      type: validated.def.type,
      options: validated.def.options,
      help: validated.def.help,
      position,
    })
    .select("id, entity, key, label, type, options, help, position, archived")
    .maybeSingle();

  if (error) {
    console.error("[custom-fields] insert failed:", error.message);
    return NextResponse.json({ ok: false, error: "That field couldn't be saved." }, { status: 502 });
  }

  return NextResponse.json({ ok: true, field: data });
}
