/**
 * PATCH /api/trips/[id]
 *
 * Small, explicit edits to a trip that have no lifecycle of their own. Today:
 *
 *   travelify_order_ref  the Travelify booking reference. Travelify is the
 *                        source of truth for payments, balances and
 *                        documents; with this reference (plus the lead
 *                        traveller's email and the departure date) the
 *                        customer portal looks the live order up. Send null
 *                        to clear it.
 *
 * Agency-scoped: the update carries `.eq("agency_id", …)`, so a trip from
 * another agency cannot be touched even if its id were known.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { apiAgencyId } from "@/lib/auth/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Travelify's own reference shape (mirrors the widget's validateOrderRef). */
const ORDER_REF_RE = /^[A-Z0-9_-]{3,40}$/;

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const id = params.id;
  if (!id || !UUID_RE.test(id)) {
    return NextResponse.json({ ok: false, error: "Invalid trip id" }, { status: 400 });
  }

  let body: { travelify_order_ref?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  if ("travelify_order_ref" in body) {
    const raw = body.travelify_order_ref;
    if (raw === null || raw === "") {
      patch.travelify_order_ref = null;
    } else if (typeof raw === "string") {
      const ref = raw.trim().toUpperCase();
      if (!ORDER_REF_RE.test(ref)) {
        return NextResponse.json(
          { ok: false, error: "A Travelify reference is 3 to 40 letters, numbers, dashes or underscores." },
          { status: 400 }
        );
      }
      patch.travelify_order_ref = ref;
    } else {
      return NextResponse.json({ ok: false, error: "Invalid reference" }, { status: 400 });
    }
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ ok: false, error: "Nothing to update" }, { status: 400 });
  }

  const supabase = createClient();
  const agencyId = await apiAgencyId();
  if (!agencyId) {
    return NextResponse.json({ ok: false, error: "No access to this workspace." }, { status: 403 });
  }

  const { data, error } = await supabase
    .from("trips")
    .update(patch)
    .eq("id", id)
    .eq("agency_id", agencyId)
    .select("id, travelify_order_ref")
    .maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ ok: false, error: "Trip not found" }, { status: 404 });

  return NextResponse.json({ ok: true, travelify_order_ref: data.travelify_order_ref ?? null });
}
