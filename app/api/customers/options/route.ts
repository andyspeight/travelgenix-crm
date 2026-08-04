/**
 * GET /api/customers/options
 *
 * A minimal {id, name} list of the agency's customers, for pickers like the
 * global quick-add task modal (which, unlike the /tasks page, has no
 * server-rendered customer list to hand). Names only, agency-scoped, capped.
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
    .from("households")
    .select("id, display_name")
    .eq("agency_id", agencyId)
    .order("display_name")
    .limit(2000);

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const customers = ((data ?? []) as { id: string; display_name: string }[]).map((h) => ({
    id: h.id,
    name: h.display_name,
  }));
  return NextResponse.json({ ok: true, customers });
}
