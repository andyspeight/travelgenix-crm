/**
 * PATCH /api/suppliers/[id] — the terms an agency trades on.
 *
 * Two fields, both of which exist so the CRM can stop guessing:
 *
 *   default_commission_rate — what this supplier usually pays. It is a
 *   fallback for a booking with no rate of its own, and it is always labelled
 *   as the supplier's usual rate rather than a confirmed one.
 *
 *   payment_terms_days — how long after travel they normally pay. Without it
 *   there is no date to chase against, and the chase list stays quiet rather
 *   than inventing one.
 *
 * Both are nullable on purpose: "we don't know" is a legitimate answer and
 * the calculator handles it honestly.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { apiAgencyId } from "@/lib/auth/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  if (!UUID_RE.test(params.id ?? "")) {
    return NextResponse.json({ ok: false, error: "Invalid supplier id" }, { status: 400 });
  }

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

  const patch: Record<string, unknown> = {};

  if ("default_commission_rate" in body) {
    const v = body.default_commission_rate;
    if (v === null || v === "") patch.default_commission_rate = null;
    else {
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0 || n > 100) {
        return NextResponse.json(
          { ok: false, error: "A commission rate is a percentage between 0 and 100." },
          { status: 400 }
        );
      }
      patch.default_commission_rate = Math.round(n * 100) / 100;
    }
  }

  if ("payment_terms_days" in body) {
    const v = body.payment_terms_days;
    if (v === null || v === "") patch.payment_terms_days = null;
    else {
      const n = Number(v);
      if (!Number.isInteger(n) || n < 0 || n > 365) {
        return NextResponse.json(
          { ok: false, error: "Payment terms are a number of days, up to a year." },
          { status: 400 }
        );
      }
      patch.payment_terms_days = n;
    }
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ ok: false, error: "Nothing to change." }, { status: 400 });
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from("suppliers")
    .update(patch)
    .eq("id", params.id)
    .eq("agency_id", agencyId)
    .select("id, name, default_commission_rate, payment_terms_days")
    .maybeSingle();

  if (error) {
    console.error("[suppliers] update failed:", error.message);
    return NextResponse.json({ ok: false, error: "That didn't save." }, { status: 502 });
  }
  if (!data) {
    return NextResponse.json({ ok: false, error: "Supplier not found." }, { status: 404 });
  }

  return NextResponse.json({ ok: true, supplier: data });
}
