/**
 * Creating an enquiry — the shared core.
 *
 * Both the hand-typed enquiry form (POST /api/enquiries) and the widget
 * ingest endpoint (POST /api/widget/lead) land here, so a website lead is
 * scored, put on the response clock, deduped against existing customers and
 * given its timeline entry EXACTLY like one an agent typed. One front door,
 * one behaviour.
 *
 * Two steps, split so validation can run before auth:
 *   normaliseEnquiryFields(body) — pure: parse/clamp the raw payload.
 *   createEnquiry(db, agencyId, …) — the agency-scoped writes.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { scoreEnquiry, type RelationshipFacts } from "./scoring";
import { responseDueAt } from "./clock";
import { emitEvent } from "@/lib/events/emit";
import type { Household } from "@/lib/supabase/types";

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

export type EnquiryFields = ReturnType<typeof buildFields>;

function buildFields(body: Record<string, unknown>) {
  const departDateRaw = str(body.depart_date, 10);
  const flexibility =
    typeof body.date_flexibility === "string" && FLEX.has(body.date_flexibility)
      ? (body.date_flexibility as "fixed" | "flexible" | "very_flexible")
      : null;
  const budgetBasis =
    typeof body.budget_basis === "string" && BUDGET_BASIS.has(body.budget_basis)
      ? (body.budget_basis as "total" | "per_person")
      : null;

  return {
    source: typeof body.source === "string" && SOURCES.has(body.source) ? body.source : "manual",
    channel_preference: str(body.channel_preference, 40),
    contact_name: str(body.contact_name, 120),
    contact_email: str(body.contact_email, 120),
    contact_phone: str(body.contact_phone, 40),
    destination: str(body.destination, 120),
    depart_date: departDateRaw && DATE_RE.test(departDateRaw) ? departDateRaw : null,
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
}

export type NormaliseResult =
  | { ok: true; fields: EnquiryFields; householdId: string | null }
  | { ok: false; error: string };

/** Parse and clamp a raw enquiry payload. Pure — no I/O, no auth. */
export function normaliseEnquiryFields(body: Record<string, unknown>): NormaliseResult {
  const fields = buildFields(body);
  if (!fields.contact_name) {
    return { ok: false, error: "A contact name is required" };
  }
  if (fields.contact_email && !EMAIL_RE.test(fields.contact_email)) {
    return { ok: false, error: "That email address doesn't look right" };
  }
  const householdId =
    typeof body.household_id === "string" && UUID_RE.test(body.household_id) ? body.household_id : null;
  return { ok: true, fields, householdId };
}

export type CreateResult =
  | { ok: true; id: string; householdId: string | null; scores: ReturnType<typeof scoreEnquiry> }
  | { ok: false; status: number; error: string };

/**
 * Write the enquiry for an agency: dedupe by email, score against any linked
 * customer, insert, emit the event and drop a timeline entry. `db` must be
 * agency-scoped or the system client with the agency passed explicitly.
 */
export async function createEnquiry(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: SupabaseClient<any>,
  agencyId: string,
  fields: EnquiryFields,
  householdId: string | null,
  nowIso: string = new Date().toISOString()
): Promise<CreateResult> {
  // Repeat-customer recognition: no household chosen but the email matches a
  // contact we already hold → link the enquiry to that household.
  let linkedHouseholdId = householdId;
  if (!linkedHouseholdId && fields.contact_email) {
    const { data: match } = await db
      .from("contacts")
      .select("household_id")
      .eq("agency_id", agencyId)
      .ilike("email", fields.contact_email)
      .limit(1)
      .maybeSingle();
    if (match?.household_id) linkedHouseholdId = match.household_id as string;
  }

  let relationship: RelationshipFacts = null;
  if (linkedHouseholdId) {
    const { data: hh } = await db
      .from("households")
      .select("lifetime_value, trips_count, last_booking_at, tags")
      .eq("id", linkedHouseholdId)
      .eq("agency_id", agencyId)
      .maybeSingle();
    if (!hh) return { ok: false, status: 404, error: "Customer not found" };
    relationship = hh as Pick<Household, "lifetime_value" | "trips_count" | "last_booking_at" | "tags">;
  }

  const scores = scoreEnquiry(fields, relationship, nowIso);

  const { data: created, error: insErr } = await db
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
    return { ok: false, status: 500, error: insErr?.message ?? "Couldn't save the enquiry" };
  }
  const id = created.id as string;

  // Best-effort — the enquiry is already saved.
  await emitEvent(db, agencyId, {
    type: "enquiry.created",
    subjectType: "enquiry",
    subjectId: id,
    householdId: linkedHouseholdId,
    payload: {
      source: fields.source,
      destination: fields.destination,
      depart_date: fields.depart_date,
      budget: fields.budget,
      ai_extracted: fields.ai_extracted,
    },
  });

  if (linkedHouseholdId) {
    try {
      await db.from("interactions").insert({
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
      // additive only
    }
  }

  return { ok: true, id, householdId: linkedHouseholdId, scores };
}
