/**
 * GET /api/inbox/badge
 *
 * The sidebar's Inbox badge: how many inbound messages Luna has marked as
 * needing attention today. Read-only, cheap (a head count), agency-scoped.
 */

import { NextResponse } from "next/server";
import { createClient, AGENCY_ID } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const supabase = createClient();
  const { count, error } = await supabase
    .from("interactions")
    .select("*", { count: "exact", head: true })
    .eq("agency_id", AGENCY_ID)
    .eq("direction", "inbound")
    .eq("ai_priority", "today");

  if (error) {
    return NextResponse.json({ ok: false, count: 0 }, { status: 500 });
  }
  return NextResponse.json({ ok: true, count: count ?? 0 });
}
