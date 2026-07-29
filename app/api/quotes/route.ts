/**
 * POST /api/quotes
 *
 * Creates a quote against a trip — version 1, or a revision. Revisions are
 * new rows: any open quote (draft/sent/viewed) on the same trip is marked
 * 'superseded' first and the new row takes version+1, so "the price has
 * changed twice" stays a countable fact (blueprint §3, price changes).
 *
 * When created as sent (`send: true`) it stamps sent_at, starts the expiry
 * window, emits `quote.sent` and nudges an 'enquiry' trip forward to
 * 'quoted' on the pipeline. Agency-scoped throughout.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { apiAgencyId } from "@/lib/auth/session";
import { emitEvent } from "@/lib/events/emit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const str = (v: unknown, max: number): string | null =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;

const money = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.min(Math.round(n * 100) / 100, 9_999_999) : null;
};

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const tripId = typeof body.trip_id === "string" && UUID_RE.test(body.trip_id) ? body.trip_id : null;
  if (!tripId) {
    return NextResponse.json({ ok: false, error: "A trip is required" }, { status: 400 });
  }

  const totalPrice = money(body.total_price);
  if (totalPrice == null) {
    return NextResponse.json({ ok: false, error: "A total price is required" }, { status: 400 });
  }

  const expiresRaw = str(body.expires_at, 10);
  const send = body.send === true;

  const supabase = createClient();
  const agencyId = await apiAgencyId();
  if (!agencyId) {
    return NextResponse.json(
      { ok: false, error: "No access to this workspace." },
      { status: 403 }
    );
  }

  const { data: trip } = await supabase
    .from("trips")
    .select("id, household_id, stage, destination")
    .eq("id", tripId)
    .eq("agency_id", agencyId)
    .maybeSingle();

  if (!trip) {
    return NextResponse.json({ ok: false, error: "Trip not found" }, { status: 404 });
  }

  const householdId = (trip as { household_id: string | null }).household_id;

  // Version = 1 + highest existing version on this trip. Any still-open
  // sibling becomes 'superseded' — one live quote per trip at a time.
  const { data: siblings } = await supabase
    .from("quotes")
    .select("id, version, status")
    .eq("trip_id", tripId)
    .eq("agency_id", agencyId)
    .order("version", { ascending: false });

  const siblingRows = (siblings ?? []) as { id: string; version: number; status: string }[];
  const version = (siblingRows[0]?.version ?? 0) + 1;
  const openSiblings = siblingRows.filter((s) =>
    ["draft", "sent", "viewed"].includes(s.status)
  );

  if (openSiblings.length > 0) {
    await supabase
      .from("quotes")
      .update({ status: "superseded" })
      .in("id", openSiblings.map((s) => s.id))
      .eq("agency_id", agencyId);
  }

  const nowIso = new Date().toISOString();
  const { data: created, error: insErr } = await supabase
    .from("quotes")
    .insert({
      agency_id: agencyId,
      trip_id: tripId,
      household_id: householdId,
      reference: str(body.reference, 60),
      version,
      status: send ? "sent" : "draft",
      total_price: totalPrice,
      deposit: money(body.deposit),
      expected_margin: money(body.expected_margin),
      options_summary: str(body.options_summary, 1000),
      notes: str(body.notes, 2000),
      sent_at: send ? nowIso : null,
      expires_at: expiresRaw && DATE_RE.test(expiresRaw) ? `${expiresRaw}T23:59:59Z` : null,
    })
    .select("id")
    .maybeSingle();

  if (insErr || !created) {
    const missingTable = insErr?.message?.includes("quotes");
    return NextResponse.json(
      {
        ok: false,
        error: missingTable
          ? "The quotes table isn't set up yet. Run supabase/migrations/20260723150000_quotes.sql in Supabase, then try again."
          : insErr?.message ?? "Couldn't save the quote",
      },
      { status: 500 }
    );
  }

  const quoteId = (created as { id: string }).id;

  // Events + pipeline nudge + timeline, all best-effort after the save.
  if (version > 1) {
    await emitEvent(supabase, agencyId, {
      type: "quote.revised",
      subjectType: "quote",
      subjectId: quoteId,
      householdId,
      payload: { trip_id: tripId, version, total_price: totalPrice },
    });
  }

  if (send) {
    await emitEvent(supabase, agencyId, {
      type: "quote.sent",
      subjectType: "quote",
      subjectId: quoteId,
      householdId,
      payload: { trip_id: tripId, version, total_price: totalPrice },
    });

    if ((trip as { stage: string }).stage === "enquiry") {
      await supabase
        .from("trips")
        .update({ stage: "quoted", updated_at: nowIso })
        .eq("id", tripId)
        .eq("agency_id", agencyId);
    }

    if (householdId) {
      try {
        await supabase.from("interactions").insert({
          agency_id: agencyId,
          household_id: householdId,
          trip_id: tripId,
          kind: "email_out",
          direction: "outbound",
          subject: `Quote v${version} sent: ${(trip as { destination: string | null }).destination ?? "trip"}`,
          body_summary: `£${Math.round(totalPrice).toLocaleString("en-GB")} quote${expiresRaw ? `, valid until ${expiresRaw}` : ""}.`,
          occurred_at: nowIso,
        });
      } catch {
        // Timeline write never fails the request.
      }
    }
  }

  return NextResponse.json({ ok: true, id: quoteId, version, status: send ? "sent" : "draft" });
}
