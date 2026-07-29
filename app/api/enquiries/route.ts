/**
 * POST /api/enquiries
 *
 * Creates an enquiry — the structured front door. The body may come from the
 * blank form or from the Luna-extract-then-review flow; either way a HUMAN
 * submitted it (extraction never writes directly, blueprint §8 approval rule).
 *
 * Server-side work on create:
 *   - validate and clamp every field (never trust the client),
 *   - compute the four qualification scores deterministically,
 *   - start the first-response clock,
 *   - emit `enquiry.created` on the event spine,
 *   - if linked to a household, drop an 'enquiry' interaction on its timeline.
 *
 * Agency-scoped throughout.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { apiAgencyId } from "@/lib/auth/session";
import { scoreEnquiry, type RelationshipFacts } from "@/lib/enquiries/scoring";
import { responseDueAt } from "@/lib/enquiries/clock";
import { emitEvent } from "@/lib/events/emit";
import type { Household } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const SOURCES = new Set(["website", "email", "phone", "walk_in", "referral", "social", "manual"]);
const FLEX = new Set(["fixed", "flexible", "very_flexible"]);
const BUDGET_BASIS = new Set(["total", "per_person"]);

const str = (v: unknown, max: number): string | null =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;

const int = (v: unknown, max: number): number | null => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.min(Math.round(n), max) : null;
};

const money = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.min(Math.round(n * 100) / 100, 9_999_999) : null;
};

const strArray = (v: unknown, maxItems: number, maxLen: number): string[] =>
  Array.isArray(v)
    ? v
        .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
        .slice(0, maxItems)
        .map((x) => x.trim().slice(0, maxLen))
    : [];

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const contactName = str(body.contact_name, 120);
  const contactEmail = str(body.contact_email, 120);
  const contactPhone = str(body.contact_phone, 40);

  if (!contactName) {
    return NextResponse.json({ ok: false, error: "A contact name is required" }, { status: 400 });
  }
  if (contactEmail && !EMAIL_RE.test(contactEmail)) {
    return NextResponse.json({ ok: false, error: "That email address doesn't look right" }, { status: 400 });
  }

  const householdId =
    typeof body.household_id === "string" && UUID_RE.test(body.household_id)
      ? body.household_id
      : null;

  const departDateRaw = str(body.depart_date, 10);
  const departDate = departDateRaw && DATE_RE.test(departDateRaw) ? departDateRaw : null;

  const source = typeof body.source === "string" && SOURCES.has(body.source) ? body.source : "manual";
  const flexibility =
    typeof body.date_flexibility === "string" && FLEX.has(body.date_flexibility)
      ? (body.date_flexibility as "fixed" | "flexible" | "very_flexible")
      : null;
  const budgetBasis =
    typeof body.budget_basis === "string" && BUDGET_BASIS.has(body.budget_basis)
      ? (body.budget_basis as "total" | "per_person")
      : null;

  const fields = {
    source,
    channel_preference: str(body.channel_preference, 40),
    contact_name: contactName,
    contact_email: contactEmail,
    contact_phone: contactPhone,
    destination: str(body.destination, 120),
    depart_date: departDate,
    date_flexibility: flexibility,
    duration_nights: int(body.duration_nights, 365),
    departure_airport: str(body.departure_airport, 80),
    adults: int(body.adults, 99),
    children: int(body.children, 99),
    child_ages: str(body.child_ages, 80),
    budget: money(body.budget),
    budget_basis: budgetBasis,
    holiday_type: str(body.holiday_type, 60),
    board_basis: str(body.board_basis, 60),
    accommodation: str(body.accommodation, 120),
    occasion: str(body.occasion, 80),
    must_haves: strArray(body.must_haves, 10, 120),
    deal_breakers: strArray(body.deal_breakers, 10, 120),
    original_wording: str(body.original_wording, 6000),
    ai_summary: str(body.ai_summary, 500),
    ai_extracted: body.ai_extracted === true,
    notes: str(body.notes, 2000),
  };

  const supabase = createClient();
  const agencyId = await apiAgencyId();
  if (!agencyId) {
    return NextResponse.json(
      { ok: false, error: "No access to this workspace." },
      { status: 403 }
    );
  }

  // Repeat-customer recognition (blueprint §10, enquiry stage): if no
  // household was chosen but the email matches a contact we already hold,
  // link the enquiry to that household automatically.
  let linkedHouseholdId = householdId;
  if (!linkedHouseholdId && contactEmail) {
    const { data: match } = await supabase
      .from("contacts")
      .select("household_id")
      .eq("agency_id", agencyId)
      .ilike("email", contactEmail)
      .limit(1)
      .maybeSingle();
    if (match?.household_id) linkedHouseholdId = (match as { household_id: string }).household_id;
  }

  // If linked to a household, load it (agency-scoped) for the fit score. A bad
  // id is rejected rather than silently unlinked.
  let relationship: RelationshipFacts = null;
  if (linkedHouseholdId) {
    const { data: hh } = await supabase
      .from("households")
      .select("lifetime_value, trips_count, last_booking_at, tags")
      .eq("id", linkedHouseholdId)
      .eq("agency_id", agencyId)
      .maybeSingle();
    if (!hh) {
      return NextResponse.json({ ok: false, error: "Customer not found" }, { status: 404 });
    }
    relationship = hh as Pick<Household, "lifetime_value" | "trips_count" | "last_booking_at" | "tags">;
  }

  const nowIso = new Date().toISOString();
  const scores = scoreEnquiry(fields, relationship, nowIso);

  const { data: created, error: insErr } = await supabase
    .from("enquiries")
    .insert({
      agency_id: agencyId,
      household_id: linkedHouseholdId,
      status: "new",
      ...fields,
      scores,
      received_at: nowIso,
      first_response_due_at: responseDueAt(nowIso),
    })
    .select("id")
    .maybeSingle();

  if (insErr || !created) {
    const missingTable = insErr?.message?.includes("enquiries");
    return NextResponse.json(
      {
        ok: false,
        error: missingTable
          ? "The enquiries table isn't set up yet. Run supabase/migrations/20260723090000_enquiries_events.sql in Supabase, then try again."
          : insErr?.message ?? "Couldn't save the enquiry",
      },
      { status: 500 }
    );
  }

  const enquiryId = (created as { id: string }).id;

  // Event + timeline entry are best-effort — the enquiry is already saved.
  await emitEvent(supabase, agencyId, {
    type: "enquiry.created",
    subjectType: "enquiry",
    subjectId: enquiryId,
    householdId: linkedHouseholdId,
    payload: {
      source,
      destination: fields.destination,
      depart_date: fields.depart_date,
      budget: fields.budget,
      ai_extracted: fields.ai_extracted,
    },
  });

  if (linkedHouseholdId) {
    try {
      await supabase.from("interactions").insert({
        agency_id: agencyId,
        household_id: linkedHouseholdId,
        kind: "enquiry",
        direction: "inbound",
        subject: `New enquiry: ${fields.destination ?? "destination TBC"}`,
        body_summary:
          fields.ai_summary ??
          [fields.destination, fields.depart_date, fields.budget ? `£${fields.budget}` : null]
            .filter(Boolean)
            .join(", "),
        occurred_at: nowIso,
      });
    } catch {
      // Timeline write is additive; never fail the create for it.
    }
  }

  return NextResponse.json({ ok: true, id: enquiryId, scores });
}
