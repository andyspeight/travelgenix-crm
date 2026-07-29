/**
 * PATCH /api/journeys/[id]
 *
 * Toggles a journey active or paused. The only field the client may set here is
 * is_active (a boolean), whitelisted exactly like the trip-stage route. The
 * update is agency-scoped so a journey from another agency can't be touched.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { apiAgencyId } from "@/lib/auth/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const id = params.id;
  if (!id || !UUID_RE.test(id)) {
    return NextResponse.json({ ok: false, error: "Invalid journey id" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const isActive = (body as { is_active?: unknown }).is_active;
  if (typeof isActive !== "boolean") {
    return NextResponse.json({ ok: false, error: "is_active must be a boolean" }, { status: 400 });
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
    .from("journeys")
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("agency_id", agencyId)
    .select("id, is_active")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ ok: false, error: "Journey not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, journey: data });
}
