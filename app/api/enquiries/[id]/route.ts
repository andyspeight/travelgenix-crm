/**
 * PATCH /api/enquiries/[id]
 *
 * The three things an agent does with an enquiry:
 *
 *   respond — stops the first-response clock (stamps first_response_at) and
 *             moves status new → responded. Emits `enquiry.responded` with the
 *             time-to-respond so response-time reporting is free later.
 *   convert — turns the enquiry into pipeline: links or creates the household
 *             (+ lead contact), creates a trip at 'enquiry' stage carrying the
 *             structured details across, stamps trip_id/household_id and
 *             status converted. Emits `enquiry.converted`.
 *   close   — status closed with a lost reason (the blueprint's lost-reason
 *             collection). Emits `enquiry.closed`.
 *
 * Agency-scoped; every write re-checks the enquiry belongs to this agency.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { apiAgencyId } from "@/lib/auth/session";
import { emitEvent } from "@/lib/events/emit";
import type { Enquiry } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Body = { action?: unknown; lost_reason?: unknown };

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const id = params.id;
  if (!id || !UUID_RE.test(id)) {
    return NextResponse.json({ ok: false, error: "Invalid enquiry id" }, { status: 400 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const action = typeof body.action === "string" ? body.action : "";
  if (!["respond", "convert", "close"].includes(action)) {
    return NextResponse.json({ ok: false, error: "Unknown action" }, { status: 400 });
  }

  const supabase = createClient();
  const agencyId = await apiAgencyId();
  if (!agencyId) {
    return NextResponse.json(
      { ok: false, error: "No access to this workspace." },
      { status: 403 }
    );
  }

  const { data: enquiryRow, error: loadErr } = await supabase
    .from("enquiries")
    .select("*")
    .eq("id", id)
    .eq("agency_id", agencyId)
    .maybeSingle();

  if (loadErr || !enquiryRow) {
    return NextResponse.json({ ok: false, error: "Enquiry not found" }, { status: 404 });
  }

  const enquiry = enquiryRow as Enquiry;
  const nowIso = new Date().toISOString();

  // ─── respond ─────────────────────────────────────────────────────────
  if (action === "respond") {
    if (enquiry.status === "converted" || enquiry.status === "closed") {
      return NextResponse.json(
        { ok: false, error: "This enquiry is already resolved" },
        { status: 409 }
      );
    }

    const firstResponseAt = enquiry.first_response_at ?? nowIso;
    const { error } = await supabase
      .from("enquiries")
      .update({ status: "responded", first_response_at: firstResponseAt })
      .eq("id", id)
      .eq("agency_id", agencyId);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    await emitEvent(supabase, agencyId, {
      type: "enquiry.responded",
      subjectType: "enquiry",
      subjectId: id,
      householdId: enquiry.household_id,
      payload: {
        response_minutes: Math.max(
          0,
          Math.round(
            (new Date(firstResponseAt).getTime() - new Date(enquiry.received_at).getTime()) / 60_000
          )
        ),
        within_sla: enquiry.first_response_due_at
          ? new Date(firstResponseAt) <= new Date(enquiry.first_response_due_at)
          : null,
      },
    });

    return NextResponse.json({ ok: true, status: "responded", first_response_at: firstResponseAt });
  }

  // ─── close ───────────────────────────────────────────────────────────
  if (action === "close") {
    if (enquiry.status === "converted") {
      return NextResponse.json(
        { ok: false, error: "Already converted — close the trip instead" },
        { status: 409 }
      );
    }

    const lostReason =
      typeof body.lost_reason === "string" && body.lost_reason.trim()
        ? body.lost_reason.trim().slice(0, 200)
        : "No reason recorded";

    const { error } = await supabase
      .from("enquiries")
      .update({ status: "closed", lost_reason: lostReason })
      .eq("id", id)
      .eq("agency_id", agencyId);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    await emitEvent(supabase, agencyId, {
      type: "enquiry.closed",
      subjectType: "enquiry",
      subjectId: id,
      householdId: enquiry.household_id,
      payload: { lost_reason: lostReason },
    });

    return NextResponse.json({ ok: true, status: "closed" });
  }

  // ─── convert ─────────────────────────────────────────────────────────
  if (enquiry.status === "converted") {
    return NextResponse.json({ ok: false, error: "Already converted" }, { status: 409 });
  }
  if (enquiry.status === "closed") {
    return NextResponse.json({ ok: false, error: "This enquiry was closed. Reopen it first." }, { status: 409 });
  }

  // 1. Household: link the existing one, or create household + lead contact
  //    from the enquiry's contact details.
  let householdId = enquiry.household_id;
  let createdHousehold = false;

  if (!householdId) {
    const name = enquiry.contact_name ?? "New customer";
    const nameParts = name.split(/\s+/);
    const firstName = nameParts[0] ?? name;
    const lastName = nameParts.slice(1).join(" ") || null;

    const { data: hh, error: hhErr } = await supabase
      .from("households")
      .insert({
        agency_id: agencyId,
        display_name: lastName ? `The ${lastName} ${enquiry.children ? "Family" : "Household"}` : name,
        household_type: (enquiry.children ?? 0) > 0 ? "family" : (enquiry.adults ?? 0) > 1 ? "couple" : "solo",
        tags: [],
        lifetime_value: 0,
        trips_count: 0,
        customer_since: nowIso.slice(0, 10),
      })
      .select("id")
      .maybeSingle();

    if (hhErr || !hh) {
      return NextResponse.json(
        { ok: false, error: hhErr?.message ?? "Couldn't create the customer record" },
        { status: 500 }
      );
    }
    householdId = (hh as { id: string }).id;
    createdHousehold = true;

    const { error: contactErr } = await supabase.from("contacts").insert({
      agency_id: agencyId,
      household_id: householdId,
      role: "lead",
      first_name: firstName,
      last_name: lastName,
      email: enquiry.contact_email,
      phone: enquiry.contact_phone,
      flags: [],
      marketing_opt_in: false,
      gdpr_consent: false,
    });
    if (contactErr) {
      await supabase.from("households").delete().eq("id", householdId).eq("agency_id", agencyId);
      return NextResponse.json({ ok: false, error: contactErr.message }, { status: 500 });
    }
  }

  // 2. Trip at 'enquiry' stage, carrying the structured details across. Value
  //    is the normalised budget (per-person × party where stated).
  const party = (enquiry.adults ?? 0) + (enquiry.children ?? 0);
  const totalBudget =
    enquiry.budget != null
      ? enquiry.budget_basis === "per_person" && party > 0
        ? enquiry.budget * party
        : enquiry.budget
      : null;

  const { data: trip, error: tripErr } = await supabase
    .from("trips")
    .insert({
      agency_id: agencyId,
      household_id: householdId,
      stage: "enquiry",
      destination: enquiry.destination,
      depart_date: enquiry.depart_date,
      duration_nights: enquiry.duration_nights,
      total_value: totalBudget,
      currency: "GBP",
      occasion: enquiry.occasion,
      source: enquiry.source,
      notes: enquiry.ai_summary ?? enquiry.original_wording?.slice(0, 500) ?? null,
    })
    .select("id")
    .maybeSingle();

  if (tripErr || !trip) {
    if (createdHousehold) {
      // Roll the fresh household back rather than leaving a tripless shell.
      await supabase.from("contacts").delete().eq("household_id", householdId).eq("agency_id", agencyId);
      await supabase.from("households").delete().eq("id", householdId).eq("agency_id", agencyId);
    }
    return NextResponse.json(
      { ok: false, error: tripErr?.message ?? "Couldn't create the trip" },
      { status: 500 }
    );
  }

  const tripId = (trip as { id: string }).id;

  // 3. Stamp the enquiry. Converting implies the customer got a response.
  const { error: updErr } = await supabase
    .from("enquiries")
    .update({
      status: "converted",
      household_id: householdId,
      trip_id: tripId,
      first_response_at: enquiry.first_response_at ?? nowIso,
    })
    .eq("id", id)
    .eq("agency_id", agencyId);

  if (updErr) {
    return NextResponse.json({ ok: false, error: updErr.message }, { status: 500 });
  }

  await emitEvent(supabase, agencyId, {
    type: "enquiry.converted",
    subjectType: "enquiry",
    subjectId: id,
    householdId,
    payload: { trip_id: tripId, created_household: createdHousehold, value: totalBudget },
  });

  // Timeline entry on the household (best-effort).
  try {
    await supabase.from("interactions").insert({
      agency_id: agencyId,
      household_id: householdId,
      trip_id: tripId,
      kind: "system",
      direction: "internal",
      subject: "Enquiry converted to trip",
      body_summary: `${enquiry.destination ?? "Destination TBC"} enquiry moved into the pipeline${totalBudget ? ` at £${Math.round(totalBudget).toLocaleString("en-GB")}` : ""}.`,
      occurred_at: nowIso,
    });
  } catch {
    // Additive only.
  }

  return NextResponse.json({
    ok: true,
    status: "converted",
    household_id: householdId,
    trip_id: tripId,
    created_household: createdHousehold,
  });
}
