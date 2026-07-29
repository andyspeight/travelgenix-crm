/**
 * /api/customers/[id]/preferences
 *
 * Agent-facing writes to a household's travel preferences. Preferences feed the
 * AI brief and Trip Match, so capturing them well makes Luna sharper over time.
 *
 * Methods:
 *   POST   { category, value }            -> add a preference
 *   PATCH  { prefId, category?, value? }  -> update a preference
 *   DELETE { prefId }                     -> remove a preference
 *
 * Security (travelgenix-security skill):
 *   - Agency-scoped: every write checks the preference belongs to a household
 *     in agencyId, so a guessed id from another agency can't be touched.
 *   - category is whitelisted (never trust the client string).
 *   - value is trimmed and length-capped (no unbounded writes).
 *   - Fails closed, generic client errors, no internal detail leaked.
 *
 * Soft-delete note: DELETE here is a real row delete, which is fine for a
 * preference (low-stakes, easily re-added). It is NOT a destructive action on
 * core customer data.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { apiAgencyId } from "@/lib/auth/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Intended preference categories (schema documents these). Whitelisted so the
// client can't write arbitrary category strings.
const CATEGORIES = [
  "style",
  "airline",
  "seat",
  "room",
  "dietary",
  "budget",
  "avoid",
  "other",
] as const;
type Category = (typeof CATEGORIES)[number];

const MAX_VALUE_LEN = 280;

function isCategory(v: unknown): v is Category {
  return typeof v === "string" && CATEGORIES.includes(v as Category);
}

/** Confirms the household exists and belongs to this agency. */
async function householdInAgency(
  supabase: ReturnType<typeof createClient>,
  agencyId: string,
  householdId: string
): Promise<boolean> {
  const { data } = await supabase
    .from("households")
    .select("id")
    .eq("id", householdId)
    .eq("agency_id", agencyId)
    .maybeSingle();
  return !!data;
}

/** Confirms a preference belongs to a household in this agency. */
async function prefInAgency(
  supabase: ReturnType<typeof createClient>,
  agencyId: string,
  prefId: string,
  householdId: string
): Promise<boolean> {
  const { data } = await supabase
    .from("preferences")
    .select("id")
    .eq("id", prefId)
    .eq("household_id", householdId)
    .maybeSingle();
  if (!data) return false;
  return householdInAgency(supabase, agencyId, householdId);
}

// ─── POST: add ──────────────────────────────────────────────────────────────
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const householdId = params.id;
  if (!UUID_RE.test(householdId)) {
    return NextResponse.json({ ok: false, error: "Invalid customer id" }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const category = (body as { category?: unknown })?.category;
  const valueRaw = (body as { value?: unknown })?.value;

  if (!isCategory(category)) {
    return NextResponse.json({ ok: false, error: "Unknown category" }, { status: 400 });
  }
  if (typeof valueRaw !== "string" || !valueRaw.trim()) {
    return NextResponse.json({ ok: false, error: "Value required" }, { status: 400 });
  }
  const value = valueRaw.trim().slice(0, MAX_VALUE_LEN);

  const supabase = createClient();
  const agencyId = await apiAgencyId();
  if (!agencyId) {
    return NextResponse.json(
      { ok: false, error: "No access to this workspace." },
      { status: 403 }
    );
  }
  if (!(await householdInAgency(supabase, agencyId, householdId))) {
    return NextResponse.json({ ok: false, error: "Customer not found" }, { status: 404 });
  }

  const { data, error } = await supabase
    .from("preferences")
    .insert({
      household_id: householdId,
      category,
      value,
      source: "manual",
    })
    .select("id, category, value")
    .single();

  if (error) {
    console.error("[preferences] insert failed:", error.message);
    return NextResponse.json({ ok: false, error: "Couldn't save preference" }, { status: 500 });
  }

  await auditPref(supabase, agencyId, householdId, `added ${category}: ${value}`);
  return NextResponse.json({ ok: true, preference: data });
}

// ─── PATCH: update ────────────────────────────────────────────────────────
export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const householdId = params.id;
  if (!UUID_RE.test(householdId)) {
    return NextResponse.json({ ok: false, error: "Invalid customer id" }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const prefId = (body as { prefId?: unknown })?.prefId;
  const category = (body as { category?: unknown })?.category;
  const valueRaw = (body as { value?: unknown })?.value;

  if (typeof prefId !== "string" || !UUID_RE.test(prefId)) {
    return NextResponse.json({ ok: false, error: "Invalid preference id" }, { status: 400 });
  }

  const update: { category?: Category; value?: string; updated_at: string } = {
    updated_at: new Date().toISOString(),
  };
  if (category !== undefined) {
    if (!isCategory(category)) {
      return NextResponse.json({ ok: false, error: "Unknown category" }, { status: 400 });
    }
    update.category = category;
  }
  if (valueRaw !== undefined) {
    if (typeof valueRaw !== "string" || !valueRaw.trim()) {
      return NextResponse.json({ ok: false, error: "Value required" }, { status: 400 });
    }
    update.value = valueRaw.trim().slice(0, MAX_VALUE_LEN);
  }

  const supabase = createClient();
  const agencyId = await apiAgencyId();
  if (!agencyId) {
    return NextResponse.json(
      { ok: false, error: "No access to this workspace." },
      { status: 403 }
    );
  }
  if (!(await prefInAgency(supabase, agencyId, prefId, householdId))) {
    return NextResponse.json({ ok: false, error: "Preference not found" }, { status: 404 });
  }

  const { data, error } = await supabase
    .from("preferences")
    .update(update)
    .eq("id", prefId)
    .eq("household_id", householdId)
    .select("id, category, value")
    .single();

  if (error) {
    console.error("[preferences] update failed:", error.message);
    return NextResponse.json({ ok: false, error: "Couldn't update preference" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, preference: data });
}

// ─── DELETE: remove ─────────────────────────────────────────────────────────
export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  const householdId = params.id;
  if (!UUID_RE.test(householdId)) {
    return NextResponse.json({ ok: false, error: "Invalid customer id" }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const prefId = (body as { prefId?: unknown })?.prefId;
  if (typeof prefId !== "string" || !UUID_RE.test(prefId)) {
    return NextResponse.json({ ok: false, error: "Invalid preference id" }, { status: 400 });
  }

  const supabase = createClient();
  const agencyId = await apiAgencyId();
  if (!agencyId) {
    return NextResponse.json(
      { ok: false, error: "No access to this workspace." },
      { status: 403 }
    );
  }
  if (!(await prefInAgency(supabase, agencyId, prefId, householdId))) {
    return NextResponse.json({ ok: false, error: "Preference not found" }, { status: 404 });
  }

  const { error } = await supabase
    .from("preferences")
    .delete()
    .eq("id", prefId)
    .eq("household_id", householdId);

  if (error) {
    console.error("[preferences] delete failed:", error.message);
    return NextResponse.json({ ok: false, error: "Couldn't remove preference" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

// ─── Audit (best-effort) ────────────────────────────────────────────────────
async function auditPref(
  supabase: ReturnType<typeof createClient>,
  agencyId: string,
  householdId: string,
  summary: string
) {
  try {
    await supabase.from("interactions").insert({
      agency_id: agencyId,
      household_id: householdId,
      kind: "system",
      direction: "internal",
      subject: "Preference updated",
      body_summary: `Agent ${summary}.`,
    });
  } catch {
    // never block the write
  }
}
