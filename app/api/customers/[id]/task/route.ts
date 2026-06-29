/**
 * POST /api/customers/[id]/task
 *
 * Creates a follow-up task against a household. Used by the customer-360 quick
 * actions ("Schedule call") and the Luna next-steps "Do" buttons. The task
 * lands in the same queue (/tasks) that journeys write to, so manual and
 * automated follow-ups live together.
 *
 * Client may supply a `kind` (whitelisted) which maps to a sensible title/due
 * date, plus an optional free-text title override, trip_id and reason. Nothing
 * else is trusted from the client; agency scoping is enforced server-side.
 */

import { NextResponse } from "next/server";
import { createClient, AGENCY_ID } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Known quick-action kinds -> default title + how many days out it's due.
const KINDS: Record<string, { title: string; dueInDays: number; priority: number }> = {
  schedule_call: { title: "Schedule a call", dueInDays: 1, priority: 1 },
  confirm_trip: { title: "Confirm trip details", dueInDays: 2, priority: 2 },
  flag_passport: { title: "Flag passport with customer", dueInDays: 3, priority: 2 },
  check_in: { title: "Send a check-in", dueInDays: 2, priority: 0 },
  follow_up: { title: "Follow up", dueInDays: 3, priority: 0 },
};

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const householdId = params.id;
  if (!householdId || !UUID_RE.test(householdId)) {
    return NextResponse.json({ ok: false, error: "Invalid customer id" }, { status: 400 });
  }

  let parsed: { kind?: unknown; title?: unknown; reason?: unknown; trip_id?: unknown };
  try {
    parsed = (await request.json()) as typeof parsed;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const kindKey = typeof parsed.kind === "string" ? parsed.kind : "follow_up";
  const preset = KINDS[kindKey] ?? KINDS.follow_up;

  const titleOverride =
    typeof parsed.title === "string" && parsed.title.trim() ? parsed.title.trim().slice(0, 200) : null;
  const reason =
    typeof parsed.reason === "string" && parsed.reason.trim() ? parsed.reason.trim().slice(0, 1000) : null;
  const tripId =
    typeof parsed.trip_id === "string" && UUID_RE.test(parsed.trip_id) ? parsed.trip_id : null;

  const supabase = createClient();

  // Resolve the household (agency-scoped) and its name for a friendly title.
  const { data: hh, error: hhErr } = await supabase
    .from("households")
    .select("id, display_name")
    .eq("id", householdId)
    .eq("agency_id", AGENCY_ID)
    .maybeSingle();
  if (hhErr) {
    return NextResponse.json({ ok: false, error: hhErr.message }, { status: 500 });
  }
  if (!hh) {
    return NextResponse.json({ ok: false, error: "Customer not found" }, { status: 404 });
  }

  const name = (hh as { display_name: string }).display_name;
  const title = titleOverride ?? `${preset.title} — ${name}`;
  const dueAt = new Date(Date.now() + preset.dueInDays * 86400000).toISOString();

  const { data, error } = await supabase
    .from("tasks")
    .insert({
      agency_id: AGENCY_ID,
      household_id: householdId,
      trip_id: tripId,
      title,
      description: reason,
      status: "open",
      priority: preset.priority,
      due_at: dueAt,
      source: "manual",
      source_meta: { kind: kindKey },
    })
    .select("id, title, due_at")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, task: data });
}
