/**
 * /api/segments
 *
 * POST — save a named segment: { label, query?, tokens }. The tokens are
 *        validated shallowly (must be an array of objects with a string label
 *        and a filter object) so a malformed payload can't poison replay.
 * GET  — list this agency's saved segments.
 *
 * Agency-scoped. If the `segments` table is absent (migration not run) we return
 * a clear, actionable error rather than a 500 stack.
 */

import { NextResponse } from "next/server";
import { createClient, AGENCY_ID } from "@/lib/supabase/server";
import { listSavedSegments } from "@/lib/segmentation/segments";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_LABEL = 80;
const MAX_TOKENS = 12;

function sanitizeTokens(input: unknown): Record<string, unknown>[] | null {
  if (!Array.isArray(input) || input.length === 0 || input.length > MAX_TOKENS) return null;
  const out: Record<string, unknown>[] = [];
  for (const t of input) {
    if (!t || typeof t !== "object") return null;
    const tok = t as Record<string, unknown>;
    if (typeof tok.label !== "string" || typeof tok.filter !== "object" || tok.filter == null) {
      return null;
    }
    out.push(tok);
  }
  return out;
}

export async function GET() {
  const supabase = createClient();
  const segments = await listSavedSegments(supabase, AGENCY_ID);
  return NextResponse.json({ ok: true, segments });
}

export async function POST(request: Request) {
  let parsed: { label?: unknown; query?: unknown; tokens?: unknown };
  try {
    parsed = (await request.json()) as typeof parsed;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const label =
    typeof parsed.label === "string" && parsed.label.trim()
      ? parsed.label.trim().slice(0, MAX_LABEL)
      : "";
  if (!label) {
    return NextResponse.json({ ok: false, error: "A name is required" }, { status: 400 });
  }

  const tokens = sanitizeTokens(parsed.tokens);
  if (!tokens) {
    return NextResponse.json({ ok: false, error: "Segment has no valid filters" }, { status: 400 });
  }

  const query = typeof parsed.query === "string" ? parsed.query.trim().slice(0, 300) : null;

  const supabase = createClient();
  const { data, error } = await supabase
    .from("segments")
    .insert({ agency_id: AGENCY_ID, label, query, tokens })
    .select("id, label")
    .maybeSingle();

  if (error) {
    if (error.code === "42P01") {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Saved segments need the segments table. Run supabase/migrations/20260628120000_segments.sql in Supabase.",
        },
        { status: 503 }
      );
    }
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, segment: data });
}
