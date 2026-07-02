/**
 * POST /api/import/customers
 *
 * The final import step. Body: { customers: ImportedCustomer[] } — records the
 * client produced by applying the (reviewed) mapping. Every record is
 * re-validated server-side; nothing is trusted from the wire.
 *
 * Dedupe: a record whose display name (case-insensitive) or lead email already
 * exists for the agency is skipped and reported, so re-running the same file
 * never creates duplicates.
 *
 * Inserts are bulk: one insert for the batch's households (ids returned in
 * order), one for their lead contacts. Capped per request; the client chunks
 * bigger files.
 */

import { NextResponse } from "next/server";
import { createClient, AGENCY_ID } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_PER_REQUEST = 200;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const HOUSEHOLD_TYPES = new Set(["family", "couple", "solo", "group"]);

type InRecord = {
  display_name?: unknown;
  household_type?: unknown;
  city?: unknown;
  tags?: unknown;
  notes?: unknown;
  customer_since?: unknown;
  lifetime_value?: unknown;
  lead?: { first_name?: unknown; last_name?: unknown; email?: unknown; phone?: unknown };
};

const str = (v: unknown, max: number): string | null =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;

export async function POST(request: Request) {
  let body: { customers?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const raw = Array.isArray(body.customers) ? (body.customers as InRecord[]) : [];
  if (raw.length === 0) {
    return NextResponse.json({ ok: false, error: "Nothing to import" }, { status: 400 });
  }
  if (raw.length > MAX_PER_REQUEST) {
    return NextResponse.json(
      { ok: false, error: `Too many records in one request (max ${MAX_PER_REQUEST})` },
      { status: 400 }
    );
  }

  const supabase = createClient();

  // ── Existing records, for dedupe ─────────────────────────────────────
  const [{ data: existingHh, error: hhErr }, { data: existingContacts }] = await Promise.all([
    supabase.from("households").select("display_name").eq("agency_id", AGENCY_ID),
    supabase.from("contacts").select("email").eq("agency_id", AGENCY_ID).not("email", "is", null),
  ]);
  if (hhErr) {
    return NextResponse.json({ ok: false, error: hhErr.message }, { status: 500 });
  }
  const existingNames = new Set(
    ((existingHh ?? []) as { display_name: string }[]).map((h) => h.display_name.toLowerCase())
  );
  const existingEmails = new Set(
    ((existingContacts ?? []) as { email: string | null }[])
      .map((c) => c.email?.toLowerCase())
      .filter(Boolean) as string[]
  );

  // ── Validate + dedupe ────────────────────────────────────────────────
  const nowIso = new Date().toISOString();
  const householdRows: Record<string, unknown>[] = [];
  const leads: { first_name: string; last_name: string | null; email: string | null; phone: string | null }[] = [];
  let skippedDuplicates = 0;
  let skippedInvalid = 0;

  for (const r of raw) {
    const displayName = str(r.display_name, 120);
    const firstName = str(r.lead?.first_name, 60);
    if (!displayName || !firstName) {
      skippedInvalid++;
      continue;
    }
    let email = str(r.lead?.email, 120);
    if (email && !EMAIL_RE.test(email)) email = null;

    const nameKey = displayName.toLowerCase();
    const emailKey = email?.toLowerCase();
    if (existingNames.has(nameKey) || (emailKey && existingEmails.has(emailKey))) {
      skippedDuplicates++;
      continue;
    }
    // Also dedupe within the file itself.
    existingNames.add(nameKey);
    if (emailKey) existingEmails.add(emailKey);

    const householdType =
      typeof r.household_type === "string" && HOUSEHOLD_TYPES.has(r.household_type)
        ? r.household_type
        : null;
    const tags = Array.isArray(r.tags)
      ? r.tags.filter((t): t is string => typeof t === "string" && !!t.trim()).map((t) => t.trim().slice(0, 40)).slice(0, 10)
      : [];
    const since = str(r.customer_since, 10);
    const ltv = typeof r.lifetime_value === "number" && r.lifetime_value >= 0 ? r.lifetime_value : null;

    householdRows.push({
      agency_id: AGENCY_ID,
      display_name: displayName,
      household_type: householdType,
      city: str(r.city, 80),
      tags,
      notes: str(r.notes, 2000),
      customer_since: since && /^\d{4}-\d{2}-\d{2}$/.test(since) ? since : nowIso.slice(0, 10),
      lifetime_value: ltv ?? 0,
      trips_count: 0,
    });
    leads.push({
      first_name: firstName,
      last_name: str(r.lead?.last_name, 60),
      email,
      phone: str(r.lead?.phone, 40),
    });
  }

  if (householdRows.length === 0) {
    return NextResponse.json({
      ok: true,
      created: 0,
      skippedDuplicates,
      skippedInvalid,
      message: "Nothing new to import",
    });
  }

  // ── Bulk insert: households first (ids back in order), then leads ────
  const { data: created, error: insErr } = await supabase
    .from("households")
    .insert(householdRows)
    .select("id");
  if (insErr || !created) {
    return NextResponse.json({ ok: false, error: insErr?.message ?? "Insert failed" }, { status: 500 });
  }

  const contactRows = (created as { id: string }[]).map((h, i) => ({
    agency_id: AGENCY_ID,
    household_id: h.id,
    role: "lead",
    first_name: leads[i].first_name,
    last_name: leads[i].last_name,
    email: leads[i].email,
    phone: leads[i].phone,
    flags: [],
    marketing_opt_in: false,
    gdpr_consent: false,
  }));

  const { error: contactErr } = await supabase.from("contacts").insert(contactRows);
  if (contactErr) {
    // Households exist but leads failed — report honestly so it can be fixed.
    return NextResponse.json(
      {
        ok: false,
        error: `Customers created but contacts failed: ${contactErr.message}. Re-running the import will skip the created customers.`,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    created: householdRows.length,
    skippedDuplicates,
    skippedInvalid,
  });
}
