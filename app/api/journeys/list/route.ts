/**
 * GET /api/journeys/list
 *
 * Active journeys as {id, name} — used by pickers (the Ask act layer, the
 * customers segment bar could share it later). Read-only, agency-scoped.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { apiAgencyId } from "@/lib/auth/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
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
    .select("id, name")
    .eq("agency_id", agencyId)
    .eq("is_active", true)
    .order("name");

  if (error) {
    return NextResponse.json({ ok: false, journeys: [] }, { status: 500 });
  }
  return NextResponse.json({ ok: true, journeys: data ?? [] });
}
