/**
 * /api/seed
 *
 * One-click seed for the demo. Visit this URL in your browser:
 *   https://your-app.vercel.app/api/seed
 *
 * Behaviour:
 *   - Checks if households already exist for the agency. If so, returns a
 *     message saying "already seeded" and does nothing. Idempotent.
 *   - Otherwise inserts: suppliers, households, contacts, trips, interactions,
 *     preferences. Returns counts.
 *   - Uses GET so it's just a URL visit, no curl/Postman/etc needed.
 *   - Returns JSON with counts for verification.
 *
 * RLS is off in MVP, so anon key writes work directly. In phase 2 this becomes
 * an authenticated admin endpoint.
 */

import { NextResponse } from "next/server";
import { createClient, AGENCY_ID } from "@/lib/supabase/server";
import {
  SEED_HOUSEHOLDS,
  SEED_SUPPLIERS,
  dateOffsetDays,
  dateOffsetHours,
} from "@/lib/seed/data";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const supabase = createClient();
  const now = new Date();

  // ─── 0. Idempotency check ──────────────────────────────────────────────
  const { count: existingCount, error: existingError } = await supabase
    .from("households")
    .select("*", { count: "exact", head: true })
    .eq("agency_id", AGENCY_ID);

  if (existingError) {
    return NextResponse.json(
      { ok: false, step: "check existing", error: existingError.message },
      { status: 500 }
    );
  }

  if ((existingCount ?? 0) > 0) {
    return NextResponse.json({
      ok: true,
      seeded: false,
      message: `Database already has ${existingCount} households. Skipping seed. Visit /api/seed/reset (not implemented yet) to wipe and re-seed.`,
      counts: { households: existingCount },
    });
  }

  // ─── 1. Suppliers ─────────────────────────────────────────────────────
  const supplierRows = SEED_SUPPLIERS.map((s) => ({
    agency_id: AGENCY_ID,
    name: s.name,
    category: s.category,
    rating: s.rating,
    flags: s.flags ?? [],
  }));
  const { error: supErr } = await supabase.from("suppliers").insert(supplierRows);
  if (supErr) {
    return NextResponse.json(
      { ok: false, step: "suppliers", error: supErr.message },
      { status: 500 }
    );
  }

  // ─── 2. Households + contacts + trips + interactions + preferences ────
  // We loop, because we need each household's id back before we can insert
  // its contacts, trips, etc.

  let householdCount = 0;
  let contactCount = 0;
  let tripCount = 0;
  let interactionCount = 0;
  let preferenceCount = 0;

  for (const seed of SEED_HOUSEHOLDS) {
    // Compute next_departure from the trips
    const upcomingDates = seed.trips
      .filter((t) => t.depart_offset_days != null && t.depart_offset_days >= 0)
      .map((t) => dateOffsetDays(t.depart_offset_days as number, now))
      .sort();

    // last_booking_at — use the most recent non-enquiry trip
    const lastBookings = seed.trips
      .filter((t) => t.stage !== "enquiry" && t.depart_offset_days != null)
      .map((t) => dateOffsetDays(t.depart_offset_days as number, now))
      .sort()
      .reverse();

    const tripsCount = seed.trips.length;

    const { data: household, error: hhErr } = await supabase
      .from("households")
      .insert({
        agency_id: AGENCY_ID,
        display_name: seed.display_name,
        household_type: seed.household_type,
        city: seed.city,
        postcode: seed.postcode,
        country: "GB",
        tags: seed.tags,
        notes: seed.notes ?? null,
        customer_since: seed.customer_since,
        lifetime_value: seed.lifetime_value,
        trips_count: tripsCount,
        next_departure: upcomingDates[0] ?? null,
        last_booking_at: lastBookings[0]
          ? new Date(lastBookings[0]).toISOString()
          : null,
        ai_brief: seed.ai_brief ?? null,
        ai_brief_at: seed.ai_brief ? now.toISOString() : null,
      })
      .select("id")
      .single();

    if (hhErr || !household) {
      return NextResponse.json(
        {
          ok: false,
          step: `household: ${seed.display_name}`,
          error: hhErr?.message ?? "no row returned",
        },
        { status: 500 }
      );
    }

    householdCount++;
    const householdId = household.id;

    // Contacts
    const contactRows = seed.contacts.map((c) => ({
      agency_id: AGENCY_ID,
      household_id: householdId,
      role: c.role,
      first_name: c.first_name,
      last_name: c.last_name ?? null,
      email: c.email ?? null,
      phone: c.phone ?? null,
      date_of_birth: c.date_of_birth ?? null,
      passport_expiry: c.passport_expiry ?? null,
      dietary: c.dietary ?? null,
      flags: c.flags ?? [],
      marketing_opt_in: c.marketing_opt_in ?? false,
      marketing_opt_in_at: c.marketing_opt_in ? now.toISOString() : null,
      gdpr_consent: c.gdpr_consent ?? false,
      gdpr_consent_at: c.gdpr_consent ? now.toISOString() : null,
    }));

    const { error: contErr } = await supabase.from("contacts").insert(contactRows);
    if (contErr) {
      return NextResponse.json(
        {
          ok: false,
          step: `contacts: ${seed.display_name}`,
          error: contErr.message,
        },
        { status: 500 }
      );
    }
    contactCount += contactRows.length;

    // Trips
    if (seed.trips.length > 0) {
      const tripRows = seed.trips.map((t) => ({
        agency_id: AGENCY_ID,
        household_id: householdId,
        reference: t.reference,
        stage: t.stage,
        destination: t.destination,
        destination_country: t.destination_country,
        depart_date:
          t.depart_offset_days != null
            ? dateOffsetDays(t.depart_offset_days, now)
            : null,
        return_date:
          t.return_offset_days != null
            ? dateOffsetDays(t.return_offset_days, now)
            : null,
        duration_nights: t.duration_nights ?? null,
        total_value: t.total_value,
        currency: "GBP",
        occasion: t.occasion ?? null,
        notes: t.notes ?? null,
        source: t.source,
      }));

      const { error: tripErr } = await supabase.from("trips").insert(tripRows);
      if (tripErr) {
        return NextResponse.json(
          {
            ok: false,
            step: `trips: ${seed.display_name}`,
            error: tripErr.message,
          },
          { status: 500 }
        );
      }
      tripCount += tripRows.length;
    }

    // Interactions
    if (seed.interactions && seed.interactions.length > 0) {
      const interactionRows = seed.interactions.map((i) => ({
        agency_id: AGENCY_ID,
        household_id: householdId,
        kind: i.kind,
        channel: i.channel,
        direction: i.direction,
        subject: i.subject ?? null,
        body: i.body,
        body_summary: i.body_summary ?? null,
        ai_priority: i.ai_priority ?? null,
        ai_reason: i.ai_reason ?? null,
        is_read: i.is_read ?? false,
        is_triaged: i.ai_priority != null,
        occurred_at: dateOffsetHours(i.occurred_offset_hours, now),
      }));

      const { error: ixErr } = await supabase
        .from("interactions")
        .insert(interactionRows);
      if (ixErr) {
        return NextResponse.json(
          {
            ok: false,
            step: `interactions: ${seed.display_name}`,
            error: ixErr.message,
          },
          { status: 500 }
        );
      }
      interactionCount += interactionRows.length;
    }

    // Preferences
    if (seed.preferences && seed.preferences.length > 0) {
      const prefRows = seed.preferences.map((p) => ({
        household_id: householdId,
        category: p.category,
        value: p.value,
        source: p.source ?? "manual",
      }));

      const { error: prefErr } = await supabase
        .from("preferences")
        .insert(prefRows);
      if (prefErr) {
        return NextResponse.json(
          {
            ok: false,
            step: `preferences: ${seed.display_name}`,
            error: prefErr.message,
          },
          { status: 500 }
        );
      }
      preferenceCount += prefRows.length;
    }
  }

  return NextResponse.json({
    ok: true,
    seeded: true,
    message: "Database seeded with realistic demo data.",
    counts: {
      suppliers: supplierRows.length,
      households: householdCount,
      contacts: contactCount,
      trips: tripCount,
      interactions: interactionCount,
      preferences: preferenceCount,
    },
  });
}
