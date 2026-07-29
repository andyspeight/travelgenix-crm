/**
 * POST /api/journeys/run
 *
 * Runs Luna's auto-pilot. Body: { journeyId?: string }.
 *   - With a journeyId, runs that one journey.
 *   - With no body, runs every active journey.
 *
 * For each journey it evaluates the matcher against current agency data, skips
 * any candidate that has already fired (dedupe, so pressing Run twice never
 * doubles up), performs the action (create a task, draft an email, add a note)
 * and logs a journey_run. Finally it stamps the journey's last_run_at.
 *
 * Everything is agency-scoped. Matching and drafting are deterministic, so this
 * route does not call out to any model and cannot fail on a missing API key.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { apiAgencyId } from "@/lib/auth/session";
import {
  evaluateJourney,
  buildAction,
  buildLastContactMap,
  type Journey,
  type EvalContext,
} from "@/lib/journeys/engine";
import type { Household, Trip, Contact, Quote } from "@/lib/supabase/types";
import { emitEvent } from "@/lib/events/emit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const candidateKey = (
  journeyId: string,
  householdId: string | null,
  tripId: string | null
) => `${journeyId}:${householdId ?? ""}:${tripId ?? ""}`;

export async function POST(request: Request) {
  // ─── Optional single-journey target ─────────────────────────────────
  let journeyId: string | undefined;
  const raw = await request.text();
  if (raw.trim()) {
    try {
      const parsed = JSON.parse(raw) as { journeyId?: unknown };
      if (typeof parsed.journeyId === "string") {
        if (!UUID_RE.test(parsed.journeyId)) {
          return NextResponse.json({ ok: false, error: "Invalid journey id" }, { status: 400 });
        }
        journeyId = parsed.journeyId;
      }
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
    }
  }

  const supabase = createClient();
  const agencyId = await apiAgencyId();
  if (!agencyId) {
    return NextResponse.json(
      { ok: false, error: "No access to this workspace." },
      { status: 403 }
    );
  }

  // ─── Load journeys to run ───────────────────────────────────────────
  let journeyQuery = supabase
    .from("journeys")
    .select("*")
    .eq("agency_id", agencyId);
  journeyQuery = journeyId
    ? journeyQuery.eq("id", journeyId)
    : journeyQuery.eq("is_active", true);

  const { data: journeyRows, error: jErr } = await journeyQuery;
  if (jErr) {
    return NextResponse.json({ ok: false, error: jErr.message }, { status: 500 });
  }
  const journeys = (journeyRows ?? []) as Journey[];
  if (journeys.length === 0) {
    return NextResponse.json({ ok: true, totalFired: 0, ran: [] });
  }

  // ─── Load the data the matcher needs (agency-scoped, in parallel) ────
  const [{ data: households }, { data: trips }, { data: contacts }, { data: ixRows }, { data: quoteRows }] =
    await Promise.all([
      supabase
        .from("households")
        .select(
          "id, display_name, customer_since, last_booking_at, trips_count"
        )
        .eq("agency_id", agencyId),
      supabase
        .from("trips")
        .select("id, household_id, stage, destination, depart_date, return_date")
        .eq("agency_id", agencyId),
      supabase
        .from("contacts")
        .select("id, household_id, first_name, last_name, passport_expiry")
        .eq("agency_id", agencyId),
      supabase
        .from("interactions")
        .select("household_id, occurred_at")
        .eq("agency_id", agencyId),
      // Live quotes feed quote-based custom rules (missing table = no matches).
      supabase
        .from("quotes")
        .select("id, trip_id, household_id, status, sent_at, total_price, customer_response, view_count")
        .eq("agency_id", agencyId)
        .in("status", ["sent", "viewed"]),
    ]);

  const hh = (households ?? []) as Household[];
  const nameById = new Map(hh.map((h) => [h.id, h.display_name]));

  const ctx: EvalContext = {
    now: new Date(),
    households: hh,
    trips: (trips ?? []) as Trip[],
    contacts: (contacts ?? []) as Contact[],
    lastContactByHousehold: buildLastContactMap(
      (ixRows ?? []) as { household_id: string | null; occurred_at: string }[]
    ),
    quotes: (quoteRows ?? []) as Quote[],
  };

  // ─── Existing runs, for dedupe ──────────────────────────────────────
  const journeyIds = journeys.map((j) => j.id);
  const { data: existingRuns } = await supabase
    .from("journey_runs")
    .select("journey_id, household_id, trip_id")
    .in("journey_id", journeyIds);

  const fired = new Set(
    (existingRuns ?? []).map((r: { journey_id: string; household_id: string | null; trip_id: string | null }) =>
      candidateKey(r.journey_id, r.household_id, r.trip_id)
    )
  );

  // ─── Evaluate + act ─────────────────────────────────────────────────
  const nowIso = new Date().toISOString();
  const runInserts: Record<string, unknown>[] = [];
  const taskInserts: Record<string, unknown>[] = [];
  const noteInserts: Record<string, unknown>[] = [];
  const summary: { journeyId: string; name: string; fired: number; skipped: number }[] = [];

  for (const journey of journeys) {
    const candidates = evaluateJourney(journey, ctx);
    let firedCount = 0;
    let skippedCount = 0;

    for (const cand of candidates) {
      const key = candidateKey(journey.id, cand.household_id, cand.trip_id);
      if (fired.has(key)) {
        skippedCount++;
        continue;
      }
      fired.add(key); // guard against duplicates within this same run too

      const name = cand.household_id ? nameById.get(cand.household_id) ?? "a customer" : "a customer";
      const action = buildAction(journey, cand, name);

      let status = "queued";
      let resultSummary = "";

      if (action.kind === "create_task") {
        taskInserts.push({
          agency_id: agencyId,
          household_id: cand.household_id,
          trip_id: cand.trip_id,
          title: action.title,
          description: action.description,
          status: "open",
          source: "journey",
          source_meta: { journey_id: journey.id, journey: journey.name, reason: cand.reason },
        });
        status = "queued";
        resultSummary = `Task created for ${name}: ${action.title}`;
      } else if (action.kind === "add_note") {
        noteInserts.push({
          agency_id: agencyId,
          household_id: cand.household_id,
          trip_id: cand.trip_id,
          body: action.body,
        });
        status = "sent";
        resultSummary = `Note added to ${name}`;
      } else {
        // draft_email — held as a draft for human review, never auto-sent.
        status = "queued";
        resultSummary = `Email drafted for ${name}: ${action.subject}`;
      }

      runInserts.push({
        journey_id: journey.id,
        household_id: cand.household_id,
        trip_id: cand.trip_id,
        status,
        result: {
          action: action.kind,
          summary: resultSummary,
          reason: cand.reason,
          ...(action.kind === "draft_email"
            ? { subject: action.subject, body: action.body }
            : {}),
          ...(action.kind === "create_task" ? { title: action.title } : {}),
        },
        fired_at: nowIso,
        ...(status === "sent" ? { resolved_at: nowIso } : {}),
      });

      firedCount++;
    }

    summary.push({ journeyId: journey.id, name: journey.name, fired: firedCount, skipped: skippedCount });
  }

  // ─── Persist (tasks, notes, runs) then stamp last_run_at ────────────
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
    .in("id", journeyIds)
    .eq("agency_id", agencyId);

  // Event spine (best-effort): one event per journey that actually fired.
  for (const r of summary) {
    if (r.fired === 0) continue;
    await emitEvent(supabase, agencyId, {
      type: "journey.executed",
      subjectType: "journey",
      subjectId: r.journeyId,
      payload: { name: r.name, fired: r.fired, skipped: r.skipped },
    });
  }

  const totalFired = summary.reduce((s, r) => s + r.fired, 0);
  return NextResponse.json({ ok: true, totalFired, ran: summary });
}
