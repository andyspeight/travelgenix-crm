/**
 * GET /api/inbox/badge
 *
 * The sidebar's Inbox badge: how many inbound messages Luna has marked as
 * needing attention today. Read-only, cheap (a head count), agency-scoped.
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
  const { count, error } = await supabase
    .from("interactions")
    .select("*", { count: "exact", head: true })
    .eq("agency_id", agencyId)
    .eq("direction", "inbound")
    .eq("ai_priority", "today");

  if (error) {
    return NextResponse.json({ ok: false, count: 0 }, { status: 500 });
  }
  return NextResponse.json({ ok: true, count: count ?? 0 });
}
