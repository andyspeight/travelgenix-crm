/**
 * POST /api/suppliers — add a supplier.
 *
 * The usability review found Commission was permanently empty for a real
 * agency: suppliers could only be created by the demo seed, and the screen
 * offered no way to add one. This is that way.
 *
 * Name is required; the usual commission rate and payment terms are optional,
 * because "we don't know yet" is a legitimate answer that lib/commission/calc
 * handles honestly rather than guessing around.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { apiAgencyId } from "@/lib/auth/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CATEGORIES = new Set([
  "tour_operator",
  "hotel",
  "flight",
  "transfer",
  "insurance",
  "experience",
  "other",
]);

export async function POST(request: Request) {
  const agencyId = await apiAgencyId();
  if (!agencyId) {
    return NextResponse.json({ ok: false, error: "No access to this workspace." }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (name.length < 2) {
    return NextResponse.json({ ok: false, error: "Give the supplier a name." }, { status: 400 });
  }
  if (name.length > 120) {
    return NextResponse.json({ ok: false, error: "That name is too long." }, { status: 400 });
  }

  const row: Record<string, unknown> = { agency_id: agencyId, name };

  if (typeof body.category === "string" && CATEGORIES.has(body.category)) {
    row.category = body.category;
  }

  if (body.default_commission_rate != null && body.default_commission_rate !== "") {
    const rate = Number(body.default_commission_rate);
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
      return NextResponse.json(
        { ok: false, error: "A commission rate is a percentage between 0 and 100." },
        { status: 400 }
      );
    }
    row.default_commission_rate = Math.round(rate * 100) / 100;
  }

  if (body.payment_terms_days != null && body.payment_terms_days !== "") {
    const days = Number(body.payment_terms_days);
    if (!Number.isInteger(days) || days < 0 || days > 365) {
      return NextResponse.json(
        { ok: false, error: "Payment terms are a number of days, up to a year." },
        { status: 400 }
      );
    }
    row.payment_terms_days = days;
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from("suppliers")
    .insert(row)
    .select("id, name, category, default_commission_rate, payment_terms_days")
    .maybeSingle();

  if (error) {
    console.error("[suppliers] insert failed:", error.message);
    return NextResponse.json({ ok: false, error: "That supplier couldn't be saved." }, { status: 502 });
  }

  return NextResponse.json({ ok: true, supplier: data });
}
