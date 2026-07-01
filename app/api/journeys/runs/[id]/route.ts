/**
 * PATCH /api/journeys/runs/[id]
 *
 * Resolves a queued journey run: mark it 'sent' (the agent reviewed the draft
 * and sent it / did the work) or 'skipped' (deliberately not acting). This is
 * the exit for the "awaiting review" state — without it queued drafts would
 * pile up forever.
 *
 * journey_runs carries no agency_id, so scoping goes through the parent
 * journey: the run is only touchable if its journey belongs to this agency.
 */

import { NextResponse } from "next/server";
import { createClient, AGENCY_ID } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ALLOWED = ["sent", "skipped"] as const;

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const id = params.id;
  if (!id || !UUID_RE.test(id)) {
    return NextResponse.json({ ok: false, error: "Invalid run id" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }
  const status = (body as { status?: unknown }).status;
  if (typeof status !== "string" || !ALLOWED.includes(status as (typeof ALLOWED)[number])) {
    return NextResponse.json({ ok: false, error: "Status must be 'sent' or 'skipped'" }, { status: 400 });
  }

  const supabase = createClient();

  // Load the run, then verify its journey belongs to this agency.
  const { data: run, error: runErr } = await supabase
    .from("journey_runs")
    .select("id, journey_id, status")
    .eq("id", id)
    .maybeSingle();
  if (runErr) {
    return NextResponse.json({ ok: false, error: runErr.message }, { status: 500 });
  }
  if (!run) {
    return NextResponse.json({ ok: false, error: "Run not found" }, { status: 404 });
  }

  const { data: journey } = await supabase
    .from("journeys")
    .select("id")
    .eq("id", (run as { journey_id: string }).journey_id)
    .eq("agency_id", AGENCY_ID)
    .maybeSingle();
  if (!journey) {
    return NextResponse.json({ ok: false, error: "Run not found" }, { status: 404 });
  }

  const { data, error } = await supabase
    .from("journey_runs")
    .update({ status, resolved_at: new Date().toISOString() })
    .eq("id", id)
    .select("id, status, resolved_at")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, run: data });
}
