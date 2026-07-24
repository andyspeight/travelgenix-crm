/**
 * POST /api/journeys/create
 *
 * Activates a composed journey — the human-approval half of the
 * natural-language builder. The body is the spec the user just reviewed;
 * it goes through validateJourneySpec AGAIN server-side (the review screen
 * is a client, and clients are never trusted), then becomes a live journeys
 * row that the existing engine, run endpoint and journeys page treat like
 * any other rule.
 */

import { NextResponse } from "next/server";
import { createClient, AGENCY_ID } from "@/lib/supabase/server";
import { validateJourneySpec, type RawJourneySpec } from "@/lib/journeys/compose";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: { spec?: RawJourneySpec };
  try {
    body = (await request.json()) as { spec?: RawJourneySpec };
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  // The client round-trips the raw spec fields so validation can re-run from
  // scratch; a doctored payload dies here.
  const result = validateJourneySpec(body.spec ?? {});
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 422 });
  }

  const supabase = createClient();
  const { data: created, error } = await supabase
    .from("journeys")
    .insert({
      agency_id: AGENCY_ID,
      name: result.def.name,
      description: result.def.description,
      trigger_kind: result.def.trigger_kind,
      trigger_config: result.def.trigger_config,
      action_kind: result.def.action_kind,
      action_config: result.def.action_config,
      is_active: true,
    })
    .select("id")
    .maybeSingle();

  if (error || !created) {
    return NextResponse.json(
      { ok: false, error: error?.message ?? "Couldn't activate the journey" },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, id: (created as { id: string }).id });
}
