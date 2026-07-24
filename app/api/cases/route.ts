/**
 * POST /api/cases
 *
 * Opens a service case. The client supplies type, subject, detail and the
 * customer (household, optionally a trip); the server computes everything
 * that matters:
 *   - travel-aware priority + its reason (lib/cases/priority.ts) from the
 *     REAL trip and traveller context — never trusted from the client,
 *   - the SLA due time from the priority's resolution target,
 *   - a `case.opened` event on the spine and a timeline interaction.
 *
 * Agency-scoped throughout.
 */

import { NextResponse } from "next/server";
import { createClient, AGENCY_ID } from "@/lib/supabase/server";
import {
  CASE_TYPES,
  CASE_TYPE_LABELS,
  computeCasePriority,
  slaDueAt,
  type CaseType,
  type CaseTravelContext,
} from "@/lib/cases/priority";
import { emitEvent } from "@/lib/events/emit";
import type { Contact, Trip } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const str = (v: unknown, max: number): string | null =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const caseType =
    typeof body.case_type === "string" && (CASE_TYPES as readonly string[]).includes(body.case_type)
      ? (body.case_type as CaseType)
      : null;
  if (!caseType) {
    return NextResponse.json({ ok: false, error: "Unknown case type" }, { status: 400 });
  }

  const subject = str(body.subject, 200);
  if (!subject) {
    return NextResponse.json({ ok: false, error: "A subject is required" }, { status: 400 });
  }
  const detail = str(body.detail, 4000);

  const householdId =
    typeof body.household_id === "string" && UUID_RE.test(body.household_id)
      ? body.household_id
      : null;
  const tripId =
    typeof body.trip_id === "string" && UUID_RE.test(body.trip_id) ? body.trip_id : null;

  const supabase = createClient();

  // ─── Load the real travel context (agency-scoped) ───────────────────
  let trip: CaseTravelContext["trip"] = null;
  let contacts: CaseTravelContext["contacts"] = [];

  if (tripId) {
    const { data } = await supabase
      .from("trips")
      .select("stage, depart_date, destination, total_value, household_id")
      .eq("id", tripId)
      .eq("agency_id", AGENCY_ID)
      .maybeSingle();
    if (!data) {
      return NextResponse.json({ ok: false, error: "Trip not found" }, { status: 404 });
    }
    trip = data as Pick<Trip, "stage" | "depart_date" | "destination" | "total_value">;
  }

  const effectiveHouseholdId =
    householdId ??
    (tripId
      ? ((await supabase
          .from("trips")
          .select("household_id")
          .eq("id", tripId)
          .eq("agency_id", AGENCY_ID)
          .maybeSingle()) .data as { household_id: string } | null)?.household_id ?? null
      : null);

  if (effectiveHouseholdId) {
    const { data: hh } = await supabase
      .from("households")
      .select("id")
      .eq("id", effectiveHouseholdId)
      .eq("agency_id", AGENCY_ID)
      .maybeSingle();
    if (!hh) {
      return NextResponse.json({ ok: false, error: "Customer not found" }, { status: 404 });
    }
    const { data: contactRows } = await supabase
      .from("contacts")
      .select("role, flags")
      .eq("household_id", effectiveHouseholdId)
      .eq("agency_id", AGENCY_ID);
    contacts = (contactRows ?? []) as Pick<Contact, "role" | "flags">[];
  }

  // ─── Compute priority + SLA server-side ─────────────────────────────
  const nowIso = new Date().toISOString();
  const computed = computeCasePriority(caseType, { trip, contacts }, nowIso);

  const { data: created, error: insErr } = await supabase
    .from("cases")
    .insert({
      agency_id: AGENCY_ID,
      household_id: effectiveHouseholdId,
      trip_id: tripId,
      case_type: caseType,
      subject,
      detail,
      status: "open",
      priority: computed.priority,
      priority_reason: computed.reason,
      opened_at: nowIso,
      sla_due_at: slaDueAt(nowIso, computed.slaHours),
    })
    .select("id")
    .maybeSingle();

  if (insErr || !created) {
    const missingTable = insErr?.message?.includes("cases");
    return NextResponse.json(
      {
        ok: false,
        error: missingTable
          ? "The cases table isn't set up yet. Run supabase/migrations/20260724090000_cases.sql in Supabase, then try again."
          : insErr?.message ?? "Couldn't open the case",
      },
      { status: 500 }
    );
  }

  const caseId = (created as { id: string }).id;

  await emitEvent(supabase, AGENCY_ID, {
    type: "case.opened",
    subjectType: "case",
    subjectId: caseId,
    householdId: effectiveHouseholdId,
    payload: { case_type: caseType, priority: computed.priority, trip_id: tripId },
  });

  if (effectiveHouseholdId) {
    try {
      await supabase.from("interactions").insert({
        agency_id: AGENCY_ID,
        household_id: effectiveHouseholdId,
        trip_id: tripId,
        kind: "system",
        direction: "internal",
        subject: `Service case opened: ${CASE_TYPE_LABELS[caseType]}`,
        body_summary: `${subject} (P${computed.priority}).`,
        occurred_at: nowIso,
      });
    } catch {
      // Timeline write never fails the request.
    }
  }

  return NextResponse.json({
    ok: true,
    id: caseId,
    priority: computed.priority,
    priority_reason: computed.reason,
    sla_hours: computed.slaHours,
  });
}
