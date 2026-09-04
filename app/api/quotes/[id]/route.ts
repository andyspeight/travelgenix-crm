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
import { createClient } from "@/lib/supabase/server";
import { apiAgencyId } from "@/lib/auth/session";
import { emitEvent } from "@/lib/events/emit";
import { acceptQuote, declineQuote, isResolvedQuote, recordQuoteView } from "@/lib/quotes/lifecycle";
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
  const agencyId = await apiAgencyId();
  if (!agencyId) {
    return NextResponse.json(
      { ok: false, error: "No access to this workspace." },
      { status: 403 }
    );
  }

  const { data: quoteRow } = await supabase
    .from("quotes")
    .select("*")
    .eq("id", id)
    .eq("agency_id", agencyId)
    .maybeSingle();

  if (!quoteRow) {
    return NextResponse.json({ ok: false, error: "Quote not found" }, { status: 404 });
  }

  const quote = quoteRow as Quote;
  const nowIso = new Date().toISOString();
  const resolved = isResolvedQuote(quote);

  // ─── send ────────────────────────────────────────────────────────────
  if (action === "send") {
    if (quote.status !== "draft") {
      return NextResponse.json({ ok: false, error: "Only a draft can be sent" }, { status: 409 });
    }
    const { error } = await supabase
      .from("quotes")
      .update({ status: "sent", sent_at: nowIso })
      .eq("id", id)
      .eq("agency_id", agencyId);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    await emitEvent(supabase, agencyId, {
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
      .eq("agency_id", agencyId)
      .eq("stage", "enquiry");

    return NextResponse.json({ ok: true, status: "sent" });
  }

  // ─── record_view ─────────────────────────────────────────────────────
  // Shared with the customer portal (lib/quotes/lifecycle).
  if (action === "record_view") {
    const r = await recordQuoteView(supabase, quote, { actor: "agent" });
    if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: r.status });
    return NextResponse.json({ ok: true, status: "viewed", view_count: r.viewCount });
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
      .eq("agency_id", agencyId);
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
      .eq("agency_id", agencyId);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, expires_at: dateRaw });
  }

  // ─── accept / decline ────────────────────────────────────────────────
  // Shared with the customer portal (lib/quotes/lifecycle): the booking
  // moment and the lost-reason collection are one implementation.
  if (action === "accept") {
    const r = await acceptQuote(supabase, quote, { actor: "agent" });
    if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: r.status });
    return NextResponse.json({ ok: true, status: "accepted" });
  }

  const reason =
    typeof body.declined_reason === "string" && body.declined_reason.trim()
      ? body.declined_reason.trim().slice(0, 200)
      : "No reason recorded";
  const r = await declineQuote(supabase, quote, { actor: "agent", reason });
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: r.status });
  return NextResponse.json({ ok: true, status: "declined" });
}
