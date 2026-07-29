/**
 * POST /api/customers/emails
 *
 * Body: { ids: string[], purpose?: "marketing" | "operational" } — household
 * ids. Returns the lead/primary contact email for each, so the segment bar
 * and the Ask Luna act layer can open a pre-addressed mail draft. No sending
 * happens here; the user's own mail client does that.
 *
 * CONSENT GATE (Consent v2, blueprint §3/§19): bulk outreach is marketing,
 * so with purpose "marketing" (the default — every current caller is a bulk
 * action) a contact is only included when the consent ledger holds a
 * current, positive email-marketing grant. Refused and never-recorded are
 * both excluded, and the response says how many were held back and why, so
 * the UI can be honest instead of silently shrinking the list.
 *
 * purpose "operational" (booking admin, service messages) skips the gate —
 * PECR distinguishes the two, and so do we.
 *
 * If the consents table doesn't exist yet (migration not run) the gate
 * falls back to the legacy marketing_opt_in flag rather than failing.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { apiAgencyId } from "@/lib/auth/session";
import { currentConsent, canMarket, type ConsentLedgerRow } from "@/lib/consent/state";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MAX_IDS = 500;

export async function POST(request: Request) {
  let parsed: { ids?: unknown; purpose?: unknown };
  try {
    parsed = (await request.json()) as { ids?: unknown; purpose?: unknown };
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const ids = Array.isArray(parsed.ids)
    ? parsed.ids.filter((x): x is string => typeof x === "string" && UUID_RE.test(x)).slice(0, MAX_IDS)
    : [];
  if (ids.length === 0) {
    return NextResponse.json({ ok: false, error: "No valid household ids" }, { status: 400 });
  }

  const purpose = parsed.purpose === "operational" ? "operational" : "marketing";

  const supabase = createClient();
  const agencyId = await apiAgencyId();
  if (!agencyId) {
    return NextResponse.json(
      { ok: false, error: "No access to this workspace." },
      { status: 403 }
    );
  }

  // Lead first, so when a household has several contacts we prefer the lead's
  // address; we still collect the rest as a fallback.
  const { data, error } = await supabase
    .from("contacts")
    .select("id, household_id, email, role, marketing_opt_in")
    .eq("agency_id", agencyId)
    .in("household_id", ids)
    .not("email", "is", null);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as {
    id: string;
    household_id: string;
    email: string | null;
    role: string;
    marketing_opt_in: boolean | null;
  }[];

  // ─── The consent gate ─────────────────────────────────────────────────
  let allowed: (r: (typeof rows)[number]) => boolean = () => true;

  if (purpose === "marketing" && rows.length > 0) {
    const { data: ledger, error: ledgerErr } = await supabase
      .from("consents")
      .select("contact_id, channel, granted, occurred_at, source")
      .eq("agency_id", agencyId)
      .eq("channel", "email")
      .in("contact_id", rows.map((r) => r.id));

    if (ledgerErr) {
      // Migration not run yet — fall back to the legacy flag so the feature
      // degrades to exactly the old behaviour's intent, not to a hard error.
      allowed = (r) => r.marketing_opt_in === true;
    } else {
      const state = currentConsent((ledger ?? []) as ConsentLedgerRow[]);
      allowed = (r) => canMarket(state, r.id, "email");
    }
  }

  // One email per household: prefer the lead, else the first permitted
  // contact found. Track households where an email exists but consent
  // doesn't, so the caller can say so.
  const byHousehold = new Map<string, string>();
  const anyEmailByHousehold = new Set<string>();

  for (const r of rows) {
    if (!r.email) continue;
    anyEmailByHousehold.add(r.household_id);
    if (!allowed(r)) continue;
    const existing = byHousehold.get(r.household_id);
    if (!existing || r.role === "lead") byHousehold.set(r.household_id, r.email);
  }

  const excludedNoConsent =
    purpose === "marketing"
      ? [...anyEmailByHousehold].filter((h) => !byHousehold.has(h)).length
      : 0;

  const emails = Array.from(new Set(byHousehold.values()));
  return NextResponse.json({
    ok: true,
    emails,
    count: emails.length,
    households: byHousehold.size,
    excluded_no_consent: excludedNoConsent,
    purpose,
  });
}
