/**
 * Running the auto-pilot — the shared engine behind both "Run now" and the
 * nightly schedule.
 *
 * This exists as one function on purpose. A scheduled run and a manual run
 * that go through different code will drift, and the drift will be found by a
 * customer rather than by us. The only difference between them is who is
 * asking: the route supplies an agency and a client, this does the work.
 *
 * Deterministic throughout — the matcher and the drafting are pure, so a run
 * cannot fail on a missing model key and cannot produce different results for
 * the same data.
 *
 * NOTHING IS SENT. Tasks and notes are written; emails are drafted and queued
 * for a human. A schedule that could email customers unattended is a different
 * product decision, and not one to arrive at by accident.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  evaluateJourney,
  buildAction,
  buildLastContactMap,
  type Journey,
  type EvalContext,
} from "@/lib/journeys/engine";
import type { Household, Trip, Contact, Quote } from "@/lib/supabase/types";
import { emitEvent } from "@/lib/events/emit";

export type JourneyRunSummary = {
  journeyId: string;
  name: string;
  fired: number;
  skipped: number;
};

export type RunResult = {
  totalFired: number;
  ran: JourneyRunSummary[];
  error?: string;
};

const candidateKey = (
  journeyId: string,
  householdId: string | null,
  tripId: string | null
) => `${journeyId}:${householdId ?? ""}:${tripId ?? ""}`;

export async function runJourneysForAgency(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  agencyId: string,
  journeyId?: string
): Promise<RunResult> {
  // ─── Load journeys to run ───────────────────────────────────────────
  let journeyQuery = supabase.from("journeys").select("*").eq("agency_id", agencyId);
  journeyQuery = journeyId
    ? journeyQuery.eq("id", journeyId)
    : journeyQuery.eq("is_active", true);

  const { data: journeyRows, error: jErr } = await journeyQuery;
  if (jErr) return { totalFired: 0, ran: [], error: jErr.message };

  const journeys = (journeyRows ?? []) as Journey[];
  if (journeys.length === 0) return { totalFired: 0, ran: [] };

  // ─── Load the data the matcher needs (agency-scoped, in parallel) ────
  const [{ data: households }, { data: trips }, { data: contacts }, { data: ixRows }, { data: quoteRows }] =
    await Promise.all([
      supabase
        .from("households")
        .select("id, display_name, customer_since, last_booking_at, trips_count")
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
  // This is what makes a nightly schedule safe: a candidate that has already
  // fired never fires again, so running daily does not nag a customer daily.
  const journeyIds = journeys.map((j) => j.id);
  const { data: existingRuns } = await supabase
    .from("journey_runs")
    .select("journey_id, household_id, trip_id")
    .in("journey_id", journeyIds);

  const fired = new Set(
    (existingRuns ?? []).map(
      (r: { journey_id: string; household_id: string | null; trip_id: string | null }) =>
        candidateKey(r.journey_id, r.household_id, r.trip_id)
    )
  );

  // ─── Evaluate + act ─────────────────────────────────────────────────
  const nowIso = new Date().toISOString();
  const runInserts: Record<string, unknown>[] = [];
  const taskInserts: Record<string, unknown>[] = [];
  const noteInserts: Record<string, unknown>[] = [];
  const summary: JourneyRunSummary[] = [];

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
        // draft_email — held for human review, never auto-sent.
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
    if (error) return { totalFired: 0, ran: summary, error: error.message };
  }
  if (noteInserts.length) {
    const { error } = await supabase.from("notes").insert(noteInserts);
    if (error) return { totalFired: 0, ran: summary, error: error.message };
  }
  if (runInserts.length) {
    const { error } = await supabase.from("journey_runs").insert(runInserts);
    if (error) return { totalFired: 0, ran: summary, error: error.message };
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

  return { totalFired: summary.reduce((s, r) => s + r.fired, 0), ran: summary };
}
