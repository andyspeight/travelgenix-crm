/**
 * POST /api/customers/emails
 *
 * Body: { ids: string[] } — household ids.
 * Returns the lead/primary contact email for each, so the Customers segment bar
 * can open a pre-addressed mail draft ("Email all"). We return emails the agency
 * already holds; no sending happens here, the user's own mail client does that.
 *
 * Only contacts with marketing consent OR an explicit non-marketing relationship
 * are returned? — for an agency emailing its own customers this is operational,
 * not marketing, so we return all on-file emails but de-duplicate them.
 */

import { NextResponse } from "next/server";
import { createClient, AGENCY_ID } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MAX_IDS = 500;

export async function POST(request: Request) {
  let parsed: { ids?: unknown };
  try {
    parsed = (await request.json()) as { ids?: unknown };
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const ids = Array.isArray(parsed.ids)
    ? parsed.ids.filter((x): x is string => typeof x === "string" && UUID_RE.test(x)).slice(0, MAX_IDS)
    : [];
  if (ids.length === 0) {
    return NextResponse.json({ ok: false, error: "No valid household ids" }, { status: 400 });
  }

  const supabase = createClient();

  // Lead first, so when a household has several contacts we prefer the lead's
  // address; we still collect the rest as a fallback.
  const { data, error } = await supabase
    .from("contacts")
    .select("household_id, email, role")
    .eq("agency_id", AGENCY_ID)
    .in("household_id", ids)
    .not("email", "is", null);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as { household_id: string; email: string | null; role: string }[];

  // One email per household: prefer the lead, else the first contact found.
  const byHousehold = new Map<string, string>();
  for (const r of rows) {
    if (!r.email) continue;
    const existing = byHousehold.get(r.household_id);
    if (!existing || r.role === "lead") byHousehold.set(r.household_id, r.email);
  }

  const emails = Array.from(new Set(byHousehold.values()));
  return NextResponse.json({ ok: true, emails, count: emails.length, households: byHousehold.size });
}
