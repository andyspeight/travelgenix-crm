/**
 * POST /api/customers/emails
 *
 * Body: { ids: string[], purpose?: "operational" } — household ids. Returns the
 * lead/primary contact email for each, so the segment bar and the Ask Luna act
 * layer can open a pre-addressed mail draft for a SERVICE ANNOUNCEMENT — a
 * flight-time change, a schedule update, a "your rep has moved" note. No sending
 * happens here; the user's own mail client does that.
 *
 * OPERATIONAL ONLY — this is not how marketing is sent.
 * A BCC blast from someone's mail client is fine for a round-robin service
 * message but it is the wrong tool for marketing: no per-recipient unsubscribe,
 * no List-Unsubscribe header, no delivery record. So this endpoint now serves
 * operational messages only and REFUSES purpose "marketing" outright. Marketing
 * to a list goes through a proper campaign sender (batched, unsubscribe footer,
 * one-click opt-out) — not this draft opener.
 *
 * The gate for a service message is SUPPRESSION, not marketing consent: PECR
 * lets a service message reach a customer regardless of their marketing
 * preference, but a dead or hostile address (a hard bounce or a spam complaint,
 * held on email_suppressions) is dead for service mail too. Those are excluded
 * and the response says how many, so the UI can be honest about the real count.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { apiAgencyId } from "@/lib/auth/session";

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

  // Marketing is not sent this way. Refuse it explicitly rather than quietly
  // treating it as operational, so a marketing caller gets a clear pointer.
  if (parsed.purpose === "marketing") {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Marketing isn't sent from here. This opens a service-announcement draft (e.g. a flight change). Use the marketing campaign sender for marketing, so every recipient gets a proper unsubscribe.",
      },
      { status: 400 }
    );
  }

  const ids = Array.isArray(parsed.ids)
    ? parsed.ids.filter((x): x is string => typeof x === "string" && UUID_RE.test(x)).slice(0, MAX_IDS)
    : [];
  if (ids.length === 0) {
    return NextResponse.json({ ok: false, error: "No valid household ids" }, { status: 400 });
  }

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
    .select("id, household_id, email, role")
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
  }[];

  // ─── The suppression gate ─────────────────────────────────────────────
  // A service message still must not go to a bounced or complained address.
  // Load the do-not-send list for the candidate addresses and exclude them.
  const candidateEmails = Array.from(
    new Set(rows.map((r) => r.email?.toLowerCase()).filter((e): e is string => Boolean(e)))
  );
  const suppressed = new Set<string>();
  if (candidateEmails.length > 0) {
    const { data: supp } = await supabase
      .from("email_suppressions")
      .select("email")
      .eq("agency_id", agencyId)
      .in("email", candidateEmails);
    for (const s of (supp ?? []) as { email: string }[]) {
      if (s.email) suppressed.add(s.email.toLowerCase());
    }
  }

  const isSuppressed = (email: string) => suppressed.has(email.toLowerCase());

  // One email per household: prefer the lead, else the first deliverable
  // contact found. Track households where an email exists but every address is
  // suppressed, so the caller can say how many were held back.
  const byHousehold = new Map<string, string>();
  const anyEmailByHousehold = new Set<string>();

  for (const r of rows) {
    if (!r.email) continue;
    anyEmailByHousehold.add(r.household_id);
    if (isSuppressed(r.email)) continue;
    const existing = byHousehold.get(r.household_id);
    if (!existing || r.role === "lead") byHousehold.set(r.household_id, r.email);
  }

  const excludedSuppressed = [...anyEmailByHousehold].filter((h) => !byHousehold.has(h)).length;

  const emails = Array.from(new Set(byHousehold.values()));
  return NextResponse.json({
    ok: true,
    emails,
    count: emails.length,
    households: byHousehold.size,
    excluded_suppressed: excludedSuppressed,
    purpose: "operational",
  });
}
