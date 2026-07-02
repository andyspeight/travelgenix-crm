/**
 * GET /api/journeys/list
 *
 * Active journeys as {id, name} — used by pickers (the Ask act layer, the
 * customers segment bar could share it later). Read-only, agency-scoped.
 */

import { NextResponse } from "next/server";
import { createClient, AGENCY_ID } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("journeys")
    .select("id, name")
    .eq("agency_id", AGENCY_ID)
    .eq("is_active", true)
    .order("name");

  if (error) {
    return NextResponse.json({ ok: false, journeys: [] }, { status: 500 });
  }
  return NextResponse.json({ ok: true, journeys: data ?? [] });
}
