/**
 * PATCH /api/customers/[id]/household
 *
 * Agent edits to the core household record: display name, type, and the
 * address (street lines, town, county, postcode).
 *
 * Scope is deliberately narrow. This route will NOT write:
 *   - lifetime_value, trips_count, last_booking_at (derived from bookings)
 *   - ai_brief / ai_match / ai_predictions (owned by the brief engine)
 *   - any compliance / passport / consent data (sensitive, edited elsewhere
 *     with its own audit treatment)
 * Only the descriptive fields an agent legitimately corrects by hand.
 *
 * Security (travelgenix-security skill):
 *   - Agency-scoped update (can't touch another agency's record).
 *   - Each field validated and length-capped; household_type whitelisted.
 *   - Only known fields are accepted; anything else is ignored, so the client
 *     cannot smuggle in an update to a protected column.
 *   - Fails closed, generic client errors.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { apiAgencyId } from "@/lib/auth/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const HOUSEHOLD_TYPES = ["solo", "couple", "family", "group", "other"] as const;
type HouseholdType = (typeof HOUSEHOLD_TYPES)[number];

const LIMITS = {
  display_name: 120,
  address_line1: 120,
  address_line2: 120,
  city: 80,
  county: 80,
  postcode: 16,
};

// The free-text address fields all validate the same way: must be a string,
// trimmed and length-capped; an empty string legitimately clears the field.
const ADDRESS_FIELDS = ["address_line1", "address_line2", "city", "county", "postcode"] as const;

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const householdId = params.id;
  if (!UUID_RE.test(householdId)) {
    return NextResponse.json({ ok: false, error: "Invalid customer id" }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ ok: false, error: "Invalid body" }, { status: 400 });
  }

  // Build the update from ONLY the known, allowed fields. Anything else the
  // client sends is silently ignored (can't reach protected columns).
  const update: Record<string, string> = { updated_at: new Date().toISOString() };
  const b = body as Record<string, unknown>;

  if (b.display_name !== undefined) {
    if (typeof b.display_name !== "string" || !b.display_name.trim()) {
      return NextResponse.json({ ok: false, error: "Name required" }, { status: 400 });
    }
    update.display_name = b.display_name.trim().slice(0, LIMITS.display_name);
  }

  if (b.household_type !== undefined) {
    if (!HOUSEHOLD_TYPES.includes(b.household_type as HouseholdType)) {
      return NextResponse.json({ ok: false, error: "Unknown type" }, { status: 400 });
    }
    update.household_type = b.household_type as string;
  }

  for (const key of ADDRESS_FIELDS) {
    if (b[key] === undefined) continue;
    if (typeof b[key] !== "string") {
      return NextResponse.json({ ok: false, error: `Invalid ${key.replace("_", " ")}` }, { status: 400 });
    }
    update[key] = (b[key] as string).trim().slice(0, LIMITS[key]);
  }

  // Nothing to do beyond the timestamp? Reject rather than write a no-op.
  if (Object.keys(update).length === 1) {
    return NextResponse.json({ ok: false, error: "No changes provided" }, { status: 400 });
  }

  const supabase = createClient();
  const agencyId = await apiAgencyId();
  if (!agencyId) {
    return NextResponse.json(
      { ok: false, error: "No access to this workspace." },
      { status: 403 }
    );
  }
  const { data, error } = await supabase
    .from("households")
    .update(update)
    .eq("id", householdId)
    .eq("agency_id", agencyId)
    .select("id, display_name, household_type, address_line1, address_line2, city, county, postcode")
    .maybeSingle();

  if (error) {
    console.error("[household] update failed:", error.message);
    return NextResponse.json({ ok: false, error: "Couldn't save changes" }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ ok: false, error: "Customer not found" }, { status: 404 });
  }

  // Audit (best-effort).
  try {
    await supabase.from("interactions").insert({
      agency_id: agencyId,
      household_id: householdId,
      kind: "system",
      direction: "internal",
      subject: "Customer details updated",
      body_summary: `Agent edited: ${Object.keys(update).filter((k) => k !== "updated_at").join(", ")}.`,
    });
  } catch {
    // never block the write
  }

  return NextResponse.json({ ok: true, household: data });
}
