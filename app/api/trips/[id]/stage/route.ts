/**
 * POST /api/trips/[id]/stage
 *
 * Moves a trip to a new pipeline stage. Called by the Kanban board when a card
 * is dragged or its stage dropdown changes.
 *
 * Validation (security skill):
 *   - The id must be a UUID (reject anything else outright).
 *   - The stage must be one of the known enum values (whitelist, never trust
 *     the client string). This is the only field we let the client set here.
 *   - The update is scoped to agencyId so a trip from another agency can't be
 *     touched even if its id were known.
 *
 * RLS is off in the MVP (single tenant), exactly as /api/seed documents. When
 * phase 2 adds auth + RLS, this becomes an authenticated mutation and the
 * agency scope comes from the session rather than an env var. The shape stays
 * the same.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { apiAgencyId } from "@/lib/auth/session";
import { refreshHouseholdRollups } from "@/lib/customer/rollups";
import { emitEvent } from "@/lib/events/emit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ALLOWED_STAGES = [
  "enquiry",
  "quoted",
  "booked",
  "pre_departure",
  "travelling",
  "returned",
  "cancelled",
] as const;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const tripId = params.id;

  // ─── Validate id ────────────────────────────────────────────────────
  if (!tripId || !UUID_RE.test(tripId)) {
    return NextResponse.json(
      { ok: false, error: "Invalid trip id" },
      { status: 400 }
    );
  }

  // ─── Parse + validate body ──────────────────────────────────────────
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const stage = (body as { stage?: unknown }).stage;
  if (
    typeof stage !== "string" ||
    !ALLOWED_STAGES.includes(stage as (typeof ALLOWED_STAGES)[number])
  ) {
    return NextResponse.json(
      { ok: false, error: "Unknown stage" },
      { status: 400 }
    );
  }

  // ─── Update (agency-scoped) ─────────────────────────────────────────
  const supabase = createClient();
  const agencyId = await apiAgencyId();
  if (!agencyId) {
    return NextResponse.json(
      { ok: false, error: "No access to this workspace." },
      { status: 403 }
    );
  }

  // Read the outgoing stage first so the event can carry from -> to.
  const { data: before } = await supabase
    .from("trips")
    .select("stage")
    .eq("id", tripId)
    .eq("agency_id", agencyId)
    .maybeSingle();
  const fromStage = (before as { stage?: string } | null)?.stage ?? null;

  const { data, error } = await supabase
    .from("trips")
    .update({ stage, updated_at: new Date().toISOString() })
    .eq("id", tripId)
    .eq("agency_id", agencyId)
    .select("id, stage, household_id")
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  if (!data) {
    return NextResponse.json(
      { ok: false, error: "Trip not found" },
      { status: 404 }
    );
  }

  // Keep the household's denormalised counters honest. Moving INTO booked is
  // the moment a booking happened, so it also stamps last_booking_at.
  // Best-effort: the stage change itself already succeeded.
  const householdId = (data as { household_id?: string }).household_id;
  if (householdId) {
    await refreshHouseholdRollups(supabase, agencyId, householdId, {
      setLastBookingAt: stage === "booked",
    });
  }

  // Event spine (best-effort): the generic stage change, plus the two
  // blueprint-named moments when they occur.
  if (fromStage !== stage) {
    await emitEvent(supabase, agencyId, {
      type: "trip.stage_changed",
      subjectType: "trip",
      subjectId: tripId,
      householdId,
      payload: { from: fromStage, to: stage },
    });
    if (stage === "booked") {
      await emitEvent(supabase, agencyId, {
        type: "booking.created",
        subjectType: "trip",
        subjectId: tripId,
        householdId,
        payload: { from: fromStage },
      });
    }
    if (stage === "returned") {
      await emitEvent(supabase, agencyId, {
        type: "trip.completed",
        subjectType: "trip",
        subjectId: tripId,
        householdId,
        payload: { from: fromStage },
      });
    }
  }

  return NextResponse.json({ ok: true, trip: { id: data.id, stage: data.stage } });
}
