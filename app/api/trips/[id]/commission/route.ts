/**
 * PATCH /api/trips/[id]/commission
 *
 * What the agency earns on one booking, and where it has got to with the
 * supplier. Every field is optional — the commission screen sends only what
 * the agent changed.
 *
 * Two things this route is careful about:
 *
 *   A RATE IS NEVER INVENTED. Sending null clears a field back to "not
 *   recorded", and "not recorded" is a real state the calculator respects.
 *   There is no default rate anywhere in this path.
 *
 *   MARKING IT RECEIVED STAMPS THE DATE. If an agent says the money arrived
 *   and gives no date, today is the honest answer, and the date is what the
 *   reports count. Moving it back off "received" clears the stamp rather than
 *   leaving a paid date on unpaid money.
 *
 * Scoped to the agency on the update itself, so a trip id from another
 * workspace cannot be touched even if it were guessed.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { apiAgencyId } from "@/lib/auth/session";
import { emitEvent } from "@/lib/events/emit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const STATUSES = new Set(["expected", "invoiced", "received", "written_off"]);

/** A number, or null to clear it. Anything else is ignored, not guessed at. */
function numberOrNull(value: unknown, max: number): number | null | undefined {
  if (value === null) return null;
  if (typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= max) {
    return Math.round(value * 100) / 100;
  }
  if (typeof value === "string" && value.trim() === "") return null;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[£,\s]/g, ""));
    if (Number.isFinite(parsed) && parsed >= 0 && parsed <= max) return Math.round(parsed * 100) / 100;
  }
  return undefined;
}

function dateOrNull(value: unknown): string | null | undefined {
  if (value === null || value === "") return null;
  if (typeof value === "string" && DATE_RE.test(value)) return value;
  return undefined;
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  if (!UUID_RE.test(params.id ?? "")) {
    return NextResponse.json({ ok: false, error: "Invalid trip id" }, { status: 400 });
  }

  const agencyId = await apiAgencyId();
  if (!agencyId) {
    return NextResponse.json({ ok: false, error: "No access to this workspace." }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};

  if ("supplier_id" in body) {
    const v = body.supplier_id;
    if (v === null || v === "") patch.supplier_id = null;
    else if (typeof v === "string" && UUID_RE.test(v)) patch.supplier_id = v;
    else return NextResponse.json({ ok: false, error: "Invalid supplier." }, { status: 400 });
  }

  if ("commission_rate" in body) {
    const v = numberOrNull(body.commission_rate, 100);
    if (v === undefined) {
      return NextResponse.json(
        { ok: false, error: "A commission rate is a percentage between 0 and 100." },
        { status: 400 }
      );
    }
    patch.commission_rate = v;
  }

  if ("commission_amount" in body) {
    const v = numberOrNull(body.commission_amount, 1_000_000);
    if (v === undefined) {
      return NextResponse.json({ ok: false, error: "That commission amount doesn't look right." }, { status: 400 });
    }
    patch.commission_amount = v;
  }

  if ("commission_status" in body) {
    const v = body.commission_status;
    if (typeof v !== "string" || !STATUSES.has(v)) {
      return NextResponse.json({ ok: false, error: "Unknown commission status." }, { status: 400 });
    }
    patch.commission_status = v;
    // The stamp follows the status, so a paid date can never sit on unpaid
    // money and reports can count on the date meaning what it says.
    if (v === "received" && !("commission_received_at" in body)) {
      patch.commission_received_at = new Date().toISOString().slice(0, 10);
    }
    if (v !== "received") patch.commission_received_at = null;
  }

  for (const field of ["commission_due_at", "commission_received_at"] as const) {
    if (field in body) {
      const v = dateOrNull(body[field]);
      if (v === undefined) {
        return NextResponse.json({ ok: false, error: "Dates need to be YYYY-MM-DD." }, { status: 400 });
      }
      patch[field] = v;
    }
  }

  if ("commission_note" in body) {
    const v = body.commission_note;
    patch.commission_note = typeof v === "string" && v.trim() ? v.trim().slice(0, 500) : null;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ ok: false, error: "Nothing to change." }, { status: 400 });
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from("trips")
    .update(patch)
    .eq("id", params.id)
    .eq("agency_id", agencyId)
    .select(
      "id, household_id, supplier_id, commission_rate, commission_amount, commission_status, commission_due_at, commission_received_at, commission_note"
    )
    .maybeSingle();

  if (error) {
    console.error("[trips/commission] update failed:", error.message);
    return NextResponse.json({ ok: false, error: "That didn't save." }, { status: 502 });
  }
  if (!data) {
    return NextResponse.json({ ok: false, error: "Booking not found." }, { status: 404 });
  }

  // Money arriving is worth a line on the spine — it is the event an owner
  // would want to search for later.
  if (patch.commission_status === "received") {
    await emitEvent(supabase, agencyId, {
      type: "commission.received",
      subjectType: "trip",
      subjectId: params.id,
      householdId: (data.household_id as string | null) ?? null,
      payload: {
        amount: data.commission_amount,
        rate: data.commission_rate,
        received_at: data.commission_received_at,
      },
    });
  }

  return NextResponse.json({ ok: true, trip: data });
}
