/**
 * POST /api/customers/[id]/note
 *
 * Adds an internal note to a household. Notes are stored as an `interactions`
 * row (kind = note, direction = internal) so they appear inline in the customer
 * timeline alongside emails and calls — one chronological record, not a second
 * silo. Agency-scoped; the body is the only client-supplied field.
 */

import { NextResponse } from "next/server";
import { createClient, AGENCY_ID } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MAX_NOTE = 4000;

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const householdId = params.id;
  if (!householdId || !UUID_RE.test(householdId)) {
    return NextResponse.json({ ok: false, error: "Invalid customer id" }, { status: 400 });
  }

  let parsed: { body?: unknown };
  try {
    parsed = (await request.json()) as { body?: unknown };
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const text = typeof parsed.body === "string" ? parsed.body.trim() : "";
  if (!text) {
    return NextResponse.json({ ok: false, error: "Note is empty" }, { status: 400 });
  }
  if (text.length > MAX_NOTE) {
    return NextResponse.json({ ok: false, error: "Note is too long" }, { status: 400 });
  }

  const supabase = createClient();

  // Confirm the household belongs to this agency before writing against it.
  const { data: hh, error: hhErr } = await supabase
    .from("households")
    .select("id")
    .eq("id", householdId)
    .eq("agency_id", AGENCY_ID)
    .maybeSingle();
  if (hhErr) {
    return NextResponse.json({ ok: false, error: hhErr.message }, { status: 500 });
  }
  if (!hh) {
    return NextResponse.json({ ok: false, error: "Customer not found" }, { status: 404 });
  }

  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from("interactions")
    .insert({
      agency_id: AGENCY_ID,
      household_id: householdId,
      kind: "note",
      channel: "note",
      direction: "internal",
      subject: "Note",
      body: text,
      is_read: true,
      is_triaged: true,
      occurred_at: nowIso,
    })
    .select("id, occurred_at")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, note: data });
}
