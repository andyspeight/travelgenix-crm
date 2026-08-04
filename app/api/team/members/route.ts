/**
 * GET /api/team/members
 *
 * The agency's people (from the users table), for assignee pickers like the
 * add-task modal. Id + name only, agency-scoped.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { apiAgencyId } from "@/lib/auth/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const agencyId = await apiAgencyId();
  if (!agencyId) {
    return NextResponse.json({ ok: false, error: "No access to this workspace." }, { status: 403 });
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from("users")
    .select("id, full_name, email")
    .eq("agency_id", agencyId)
    .order("full_name");

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const members = ((data ?? []) as { id: string; full_name: string | null; email: string }[]).map((u) => ({
    id: u.id,
    name: u.full_name?.trim() || u.email,
  }));
  return NextResponse.json({ ok: true, members });
}
