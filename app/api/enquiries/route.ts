/**
 * POST /api/enquiries
 *
 * Creates an enquiry — the structured front door for a HUMAN-submitted lead
 * (the blank form or the Luna-extract-then-review flow; extraction never
 * writes directly, blueprint §8 approval rule).
 *
 * The parse → score → clock → dedupe → event → timeline work lives in
 * lib/enquiries/create.ts, shared with the widget ingest endpoint so a website
 * lead behaves exactly like one typed here. This route only adds the human
 * auth (agency from the session).
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { apiAgencyId } from "@/lib/auth/session";
import { normaliseEnquiryFields, createEnquiry } from "@/lib/enquiries/create";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const norm = normaliseEnquiryFields(body);
  if (!norm.ok) {
    return NextResponse.json({ ok: false, error: norm.error }, { status: 400 });
  }

  const agencyId = await apiAgencyId();
  if (!agencyId) {
    return NextResponse.json({ ok: false, error: "No access to this workspace." }, { status: 403 });
  }

  const result = await createEnquiry(createClient(), agencyId, norm.fields, norm.householdId);
  if (!result.ok) {
    // Keep the friendly "table not set up" hint the form relied on.
    const missingTable = result.status === 500 && /enquiries/.test(result.error);
    return NextResponse.json(
      {
        ok: false,
        error: missingTable
          ? "The enquiries table isn't set up yet. Run supabase/migrations/20260723090000_enquiries_events.sql in Supabase, then try again."
          : result.error,
      },
      { status: result.status }
    );
  }

  return NextResponse.json({ ok: true, id: result.id, scores: result.scores });
}
