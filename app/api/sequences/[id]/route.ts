/**
 * PATCH /api/sequences/[id] — turn a sequence on or off, or change how it sends.
 *
 * Body: { is_active?: boolean, auto_send?: boolean }
 *
 * auto_send is the consequential one: it moves a sequence from "queue a draft
 * for me" to "send this to my customers while I am not looking". So it is an
 * explicit, separate decision from activation, and the UI states plainly what
 * it means rather than presenting it as a preference.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { apiAgencyId } from "@/lib/auth/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  let body: { is_active?: unknown; auto_send?: unknown };
  try {
    body = (await request.json()) as { is_active?: unknown; auto_send?: unknown };
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.is_active === "boolean") patch.is_active = body.is_active;
  if (typeof body.auto_send === "boolean") patch.auto_send = body.auto_send;
  if (Object.keys(patch).length === 1) {
    return NextResponse.json({ ok: false, error: "Nothing to change." }, { status: 400 });
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
    .from("sequences")
    .update(patch)
    .eq("id", params.id)
    .eq("agency_id", agencyId)
    .select("id, is_active, auto_send")
    .maybeSingle();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });

  return NextResponse.json({ ok: true, sequence: data });
}
