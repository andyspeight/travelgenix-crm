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
 *   - The update is scoped to AGENCY_ID so a trip from another agency can't be
 *     touched even if its id were known.
 *
 * RLS is off in the MVP (single tenant), exactly as /api/seed documents. When
 * phase 2 adds auth + RLS, this becomes an authenticated mutation and the
 * agency scope comes from the session rather than an env var. The shape stays
 * the same.
 */

import { NextResponse } from "next/server";
import { createClient, AGENCY_ID } from "@/lib/supabase/server";

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
  const { data, error } = await supabase
    .from("trips")
    .update({ stage, updated_at: new Date().toISOString() })
    .eq("id", tripId)
    .eq("agency_id", AGENCY_ID)
    .select("id, stage")
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

  return NextResponse.json({ ok: true, trip: data });
}
