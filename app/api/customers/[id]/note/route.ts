/**
 * POST /api/customers/[id]/note
 *
 * Logs a note or a phone call onto a household. Both are stored as an
 * `interactions` row (direction = internal) so they appear inline in the
 * customer timeline alongside emails — one chronological record, not a second
 * silo. A call carries kind = call so the timeline labels it as one; a note is
 * kind = note. Agency-scoped; the body and kind are the only client fields.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { apiAgencyId } from "@/lib/auth/session";
import { validateLogEntry, logEntryRow } from "@/lib/customer/log-entry";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const householdId = params.id;
  if (!householdId || !UUID_RE.test(householdId)) {
    return NextResponse.json({ ok: false, error: "Invalid customer id" }, { status: 400 });
  }

  let parsed: { body?: unknown; kind?: unknown };
  try {
    parsed = (await request.json()) as { body?: unknown; kind?: unknown };
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const entry = validateLogEntry({ body: parsed.body, kind: parsed.kind });
  if (!entry.ok) {
    return NextResponse.json({ ok: false, error: entry.error }, { status: 400 });
  }

  const supabase = createClient();
  const agencyId = await apiAgencyId();
  if (!agencyId) {
    return NextResponse.json(
      { ok: false, error: "No access to this workspace." },
      { status: 403 }
    );
  }

  // Confirm the household belongs to this agency before writing against it.
  const { data: hh, error: hhErr } = await supabase
    .from("households")
    .select("id")
    .eq("id", householdId)
    .eq("agency_id", agencyId)
    .maybeSingle();
  if (hhErr) {
    return NextResponse.json({ ok: false, error: hhErr.message }, { status: 500 });
  }
  if (!hh) {
    return NextResponse.json({ ok: false, error: "Customer not found" }, { status: 404 });
  }

  const nowIso = new Date().toISOString();
  const row = logEntryRow(entry.kind);
  const { data, error } = await supabase
    .from("interactions")
    .insert({
      agency_id: agencyId,
      household_id: householdId,
      kind: row.kind,
      channel: row.channel,
      direction: "internal",
      subject: row.subject,
      body: entry.body,
      is_read: true,
      is_triaged: true,
      occurred_at: nowIso,
    })
    .select("id, occurred_at")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, entry: data });
}
