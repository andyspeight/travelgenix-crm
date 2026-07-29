/**
 * POST /api/journeys/install
 *
 * Installs the starter journeys for the agency. Idempotent: if any journey
 * already exists it does nothing, so the button on the journeys page can be
 * pressed safely without creating duplicates.
 *
 * Agency-scoped, same single-tenant model as /api/seed. RLS lands in phase 2.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { apiAgencyId } from "@/lib/auth/session";
import { DEFAULT_JOURNEYS } from "@/lib/journeys/engine";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST() {
  const supabase = createClient();
  const agencyId = await apiAgencyId();
  if (!agencyId) {
    return NextResponse.json(
      { ok: false, error: "No access to this workspace." },
      { status: 403 }
    );
  }

  const { count, error: countErr } = await supabase
    .from("journeys")
    .select("*", { count: "exact", head: true })
    .eq("agency_id", agencyId);

  if (countErr) {
    return NextResponse.json({ ok: false, error: countErr.message }, { status: 500 });
  }

  if ((count ?? 0) > 0) {
    return NextResponse.json({ ok: true, installed: 0, message: "Journeys already exist" });
  }

  const rows = DEFAULT_JOURNEYS.map((d) => ({
    agency_id: agencyId,
    name: d.name,
    description: d.description,
    trigger_kind: d.trigger_kind,
    trigger_config: d.trigger_config,
    action_kind: d.action_kind,
    action_config: d.action_config,
    is_active: true,
  }));

  const { error: insErr } = await supabase.from("journeys").insert(rows);
  if (insErr) {
    return NextResponse.json({ ok: false, error: insErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, installed: rows.length });
}
