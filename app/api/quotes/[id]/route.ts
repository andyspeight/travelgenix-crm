/**
 * PATCH /api/quotes/[id]
 *
 * The lifecycle actions on a quote:
 *
 *   send         — draft → sent (starts the story, emits quote.sent, nudges
 *                  an 'enquiry' trip to 'quoted')
 *   record_view  — the customer opened it: view_count+1, viewed_at, status
 *                  viewed, emits quote.viewed. Manual for now; a tracking
 *                  webhook calls the same action later.
 *   respond      — record what the customer actually said (silences the
 *                  engaged-no-response rescue signal, honestly)
 *   accept       — quote accepted: trip moves to 'booked', trip value updated
 *                  to the quoted price, household rollups + last_booking_at
 *                  refreshed, emits quote.accepted
 *   decline      — status declined with the reason (lost-reason collection)
 *   extend       — push the expiry date out
 *
 * Agency-scoped; the quote is loaded and checked before any write.
 */

import { NextResponse } from "next/server";
import { createClient, AGENCY_ID } from "@/lib/supabase/server";
import { refreshHouseholdRollups } from "@/lib/customer/rollups";
import { emitEvent } from "@/lib/events/emit";
import type { Quote } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const ACTIONS = new Set(["send", "record_view", "respond", "accept", "decline", "extend"]);

type Body = {
  action?: unknown;
  customer_response?: unknown;
  declined_reason?: unknown;
  expires_at?: unknown;
};

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const id = params.id;
  if (!id || !UUID_RE.test(id)) {
    return NextResponse.json({ ok: false, error: "Invalid quote id" }, { status: 400 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const action = typeof body.action === "string" && ACTIONS.has(body.action) ? body.action : null;
  if (!action) {
    return NextResponse.json({ ok: false, error: "Unknown action" }, { status: 400 });
  }

  const supabase = createClient();

  const { data: quoteRow } = await supabase
    .from("quotes")
    .select("*")
    .eq("id", id)
    .eq("agency_id", AGENCY_ID)
    .maybeSingle();

  if (!quoteRow) {
    return NextResponse.json({ ok: false, error: "Quote not found" }, { status: 404 });
  }

  const quote = quoteRow as Quote;
  const nowIso = new Date().toISOString();
  const resolved = quote.status === "accepted" || quote.status === "declined" || quote.status === "superseded";

  // ─── send ────────────────────────────────────────────────────────────
  if (action === "send") {
    if (quote.status !== "draft") {
      return NextResponse.json({ ok: false, error: "Only a draft can be sent" }, { status: 409 });
    }
    const { error } = await supabase
      .from("quotes")
      .update({ status: "sent", sent_at: nowIso })
      .eq("id", id)
      .eq("agency_id", AGENCY_ID);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    await emitEvent(supabase, AGENCY_ID, {
      type: "quote.sent",
      subjectType: "quote",
      subjectId: id,
      householdId: quote.household_id,
      payload: { trip_id: quote.trip_id, version: quote.version, total_price: quote.total_price },
    });
    await supabase
      .from("trips")
      .update({ stage: "quoted", updated_at: nowIso })
      .eq("id", quote.trip_id)
      .eq("agency_id", AGENCY_ID)
      .eq("stage", "enquiry");

    return NextResponse.json({ ok: true, status: "sent" });
  }

  // ─── record_view ─────────────────────────────────────────────────────
  if (action === "record_view") {
    if (resolved || quote.status === "draft") {
      return NextResponse.json(
        { ok: false, error: "Views only count on a live, sent quote" },
        { status: 409 }
      );
    }
    const { error } = await supabase
      .from("quotes")
      .update({ status: "viewed", viewed_at: nowIso, view_count: quote.view_count + 1 })
      .eq("id", id)
      .eq("agency_id", AGENCY_ID);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    await emitEvent(supabase, AGENCY_ID, {
      type: "quote.viewed",
      subjectType: "quote",
      subjectId: id,
      householdId: quote.household_id,
      payload: { trip_id: quote.trip_id, view_count: quote.view_count + 1 },
    });

    return NextResponse.json({ ok: true, status: "viewed", view_count: quote.view_count + 1 });
  }

  // ─── respond ─────────────────────────────────────────────────────────
  if (action === "respond") {
    const response =
      typeof body.customer_response === "string" && body.customer_response.trim()
        ? body.customer_response.trim().slice(0, 500)
        : null;
    if (!response) {
      return NextResponse.json({ ok: false, error: "What did the customer say?" }, { status: 400 });
    }
    const { error } = await supabase
      .from("quotes")
      .update({ customer_response: response })
      .eq("id", id)
      .eq("agency_id", AGENCY_ID);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  // ─── extend ──────────────────────────────────────────────────────────
  if (action === "extend") {
    const dateRaw = typeof body.expires_at === "string" ? body.expires_at : "";
    if (!DATE_RE.test(dateRaw)) {
      return NextResponse.json({ ok: false, error: "A new expiry date is required" }, { status: 400 });
    }
    if (resolved) {
      return NextResponse.json({ ok: false, error: "This quote is already resolved" }, { status: 409 });
    }
    const { error } = await supabase
      .from("quotes")
      .update({
        expires_at: `${dateRaw}T23:59:59Z`,
        // An expired-but-unmarked quote comes back to life when extended.
        status: quote.status === "expired" ? "sent" : quote.status,
      })
      .eq("id", id)
      .eq("agency_id", AGENCY_ID);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, expires_at: dateRaw });
  }

  // ─── accept / decline ────────────────────────────────────────────────
  if (resolved) {
    return NextResponse.json({ ok: false, error: "This quote is already resolved" }, { status: 409 });
  }

  if (action === "accept") {
    const { error } = await supabase
      .from("quotes")
      .update({ status: "accepted" })
      .eq("id", id)
      .eq("agency_id", AGENCY_ID);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    // The booking moment: trip takes the quoted price and moves to booked,
    // household counters refresh with last_booking_at stamped.
    await supabase
      .from("trips")
      .update({
        stage: "booked",
        total_value: quote.total_price,
        updated_at: nowIso,
      })
      .eq("id", quote.trip_id)
      .eq("agency_id", AGENCY_ID);

    if (quote.household_id) {
      await refreshHouseholdRollups(supabase, AGENCY_ID, quote.household_id, {
        setLastBookingAt: true,
      });
      try {
        await supabase.from("interactions").insert({
          agency_id: AGENCY_ID,
          household_id: quote.household_id,
          trip_id: quote.trip_id,
          kind: "system",
          direction: "internal",
          subject: `Quote v${quote.version} accepted`,
          body_summary: `Booked at £${Math.round(quote.total_price ?? 0).toLocaleString("en-GB")}. Trip moved to booked.`,
          occurred_at: nowIso,
        });
      } catch {
        // Timeline write never fails the request.
      }
    }

    await emitEvent(supabase, AGENCY_ID, {
      type: "quote.accepted",
      subjectType: "quote",
      subjectId: id,
      householdId: quote.household_id,
      payload: { trip_id: quote.trip_id, version: quote.version, total_price: quote.total_price },
    });

    return NextResponse.json({ ok: true, status: "accepted" });
  }

  // decline
  const reason =
    typeof body.declined_reason === "string" && body.declined_reason.trim()
      ? body.declined_reason.trim().slice(0, 200)
      : "No reason recorded";

  const { error } = await supabase
    .from("quotes")
    .update({ status: "declined", declined_reason: reason })
    .eq("id", id)
    .eq("agency_id", AGENCY_ID);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  await emitEvent(supabase, AGENCY_ID, {
    type: "quote.declined",
    subjectType: "quote",
    subjectId: id,
    householdId: quote.household_id,
    payload: { trip_id: quote.trip_id, version: quote.version, reason },
  });

  return NextResponse.json({ ok: true, status: "declined" });
}
