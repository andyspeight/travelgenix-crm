/**
 * POST /api/journeys/enroll
 *
 * Body: { journeyId: string, householdIds: string[] }
 *
 * Manual enrollment: the user has hand-picked a set of customers (from a smart
 * segment) and wants a chosen journey's action applied to them now, without
 * waiting for the journey's trigger to match. We run that journey's action
 * builder for each household, write the resulting task / note / draft, and log a
 * journey_run per household so it shows in the journey's history and is deduped
 * against future automatic runs.
 *
 * This complements the trigger-based /api/journeys/run: same actions, same log,
 * but the audience is explicit rather than matched.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { apiAgencyId } from "@/lib/auth/session";
import { buildAction, type Journey, type Candidate } from "@/lib/journeys/engine";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX = 200;

const candidateKey = (journeyId: string, householdId: string) =>
  `${journeyId}:${householdId}:`;

export async function POST(request: Request) {
  let parsed: { journeyId?: unknown; householdIds?: unknown };
  try {
    parsed = (await request.json()) as typeof parsed;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const journeyId = typeof parsed.journeyId === "string" ? parsed.journeyId : "";
  if (!UUID_RE.test(journeyId)) {
    return NextResponse.json({ ok: false, error: "Invalid journey id" }, { status: 400 });
  }
  const householdIds = Array.isArray(parsed.householdIds)
    ? parsed.householdIds.filter((x): x is string => typeof x === "string" && UUID_RE.test(x)).slice(0, MAX)
    : [];
  if (householdIds.length === 0) {
    return NextResponse.json({ ok: false, error: "No valid household ids" }, { status: 400 });
  }

  const supabase = createClient();
  const agencyId = await apiAgencyId();
  if (!agencyId) {
    return NextResponse.json(
      { ok: false, error: "No access to this workspace." },
      { status: 403 }
    );
  }

  // Load the journey (agency-scoped) and the target households' names.
  const [{ data: journeyRow, error: jErr }, { data: hhRows, error: hErr }] = await Promise.all([
    supabase.from("journeys").select("*").eq("id", journeyId).eq("agency_id", agencyId).maybeSingle(),
    supabase.from("households").select("id, display_name").eq("agency_id", agencyId).in("id", householdIds),
  ]);
  if (jErr) return NextResponse.json({ ok: false, error: jErr.message }, { status: 500 });
  if (hErr) return NextResponse.json({ ok: false, error: hErr.message }, { status: 500 });
  if (!journeyRow) return NextResponse.json({ ok: false, error: "Journey not found" }, { status: 404 });

  const journey = journeyRow as Journey;
  const nameById = new Map((hhRows ?? []).map((h: { id: string; display_name: string }) => [h.id, h.display_name]));

  // Dedupe against prior runs of this journey for these households.
  const { data: existingRuns } = await supabase
    .from("journey_runs")
    .select("household_id")
    .eq("journey_id", journeyId)
    .in("household_id", householdIds);
  const fired = new Set(
    (existingRuns ?? []).map((r: { household_id: string | null }) =>
      candidateKey(journeyId, r.household_id ?? "")
    )
  );

  const nowIso = new Date().toISOString();
  const taskInserts: Record<string, unknown>[] = [];
  const noteInserts: Record<string, unknown>[] = [];
  const runInserts: Record<string, unknown>[] = [];
  let enrolled = 0;
  let skipped = 0;

  for (const hid of householdIds) {
    const key = candidateKey(journeyId, hid);
    if (fired.has(key)) {
      skipped++;
      continue;
    }
    fired.add(key);

    const name = nameById.get(hid) ?? "a customer";
    const candidate: Candidate = {
      household_id: hid,
      trip_id: null,
      reason: `Added to "${journey.name}" from a segment`,
      subject: name,
    };
    const action = buildAction(journey, candidate, name);

    let status = "queued";
    let summary = "";
    if (action.kind === "create_task") {
      taskInserts.push({
        agency_id: agencyId,
        household_id: hid,
        title: action.title,
        description: action.description,
        status: "open",
        source: "journey",
        source_meta: { journey_id: journey.id, journey: journey.name, enrolled: true },
      });
      summary = `Task created for ${name}: ${action.title}`;
    } else if (action.kind === "add_note") {
      noteInserts.push({ agency_id: agencyId, household_id: hid, body: action.body });
      status = "sent";
      summary = `Note added to ${name}`;
    } else {
      summary = `Email drafted for ${name}: ${action.subject}`;
    }

    runInserts.push({
      journey_id: journey.id,
      household_id: hid,
      trip_id: null,
      status,
      result: {
        action: action.kind,
        summary,
        enrolled: true,
        ...(action.kind === "draft_email" ? { subject: action.subject, body: action.body } : {}),
        ...(action.kind === "create_task" ? { title: action.title } : {}),
      },
      fired_at: nowIso,
      ...(status === "sent" ? { resolved_at: nowIso } : {}),
    });
    enrolled++;
  }

  if (taskInserts.length) {
    const { error } = await supabase.from("tasks").insert(taskInserts);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  if (noteInserts.length) {
    const { error } = await supabase.from("notes").insert(noteInserts);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  if (runInserts.length) {
    const { error } = await supabase.from("journey_runs").insert(runInserts);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  await supabase
    .from("journeys")
    .update({ last_run_at: nowIso, updated_at: nowIso })
    .eq("id", journeyId)
    .eq("agency_id", agencyId);

  return NextResponse.json({ ok: true, enrolled, skipped, journey: journey.name });
}
