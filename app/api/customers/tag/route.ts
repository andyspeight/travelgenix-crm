/**
 * POST /api/customers/tag
 *
 * Body: { ids: string[], tag: string }
 * Adds a tag to each of the given households (idempotent — never duplicates an
 * existing tag). Used by the Customers bulk-action bar ("Add tag"). Agency-scoped.
 */

import { NextResponse } from "next/server";
import { createClient, AGENCY_ID } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_IDS = 500;

export async function POST(request: Request) {
  let parsed: { ids?: unknown; tag?: unknown };
  try {
    parsed = (await request.json()) as typeof parsed;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const ids = Array.isArray(parsed.ids)
    ? parsed.ids.filter((x): x is string => typeof x === "string" && UUID_RE.test(x)).slice(0, MAX_IDS)
    : [];
  const tag = typeof parsed.tag === "string" ? parsed.tag.trim().slice(0, 40) : "";

  if (ids.length === 0) {
    return NextResponse.json({ ok: false, error: "No valid household ids" }, { status: 400 });
  }
  if (!tag) {
    return NextResponse.json({ ok: false, error: "Tag is empty" }, { status: 400 });
  }

  const supabase = createClient();

  // Read current tags so we can append without clobbering or duplicating.
  const { data: rows, error: readErr } = await supabase
    .from("households")
    .select("id, tags")
    .eq("agency_id", AGENCY_ID)
    .in("id", ids);
  if (readErr) {
    return NextResponse.json({ ok: false, error: readErr.message }, { status: 500 });
  }

  const nowIso = new Date().toISOString();
  let updated = 0;
  for (const row of (rows ?? []) as { id: string; tags: string[] | null }[]) {
    const tags = Array.isArray(row.tags) ? row.tags : [];
    if (tags.includes(tag)) continue;
    const { error } = await supabase
      .from("households")
      .update({ tags: [...tags, tag], updated_at: nowIso })
      .eq("id", row.id)
      .eq("agency_id", AGENCY_ID);
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    updated++;
  }

  return NextResponse.json({ ok: true, updated, tag });
}
