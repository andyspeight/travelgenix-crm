/**
 * PATCH /api/custom-fields/[id] — rename, reorder, retire.
 *
 * What can change: the label, the help text, the options on a list, the
 * position, and whether it is archived.
 *
 * What cannot: the TYPE and the KEY. The type because reinterpreting values
 * already recorded is a silent data loss; the key because every value written
 * so far is stored under it, and renaming the label must never orphan them.
 *
 * There is no DELETE. Archiving takes a field off the form and keeps what was
 * recorded, which the record then shows marked as no longer in use. Removing
 * the definition outright would leave values in the json with nothing to
 * explain them — the kind of tidy-up that reads as a bug six months later.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { apiAgencyId } from "@/lib/auth/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  if (!UUID_RE.test(params.id ?? "")) {
    return NextResponse.json({ ok: false, error: "Invalid field id" }, { status: 400 });
  }

  const agencyId = await apiAgencyId();
  if (!agencyId) {
    return NextResponse.json({ ok: false, error: "No access to this workspace." }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const supabase = createClient();
  const { data: current } = await supabase
    .from("custom_fields")
    .select("id, type, options")
    .eq("agency_id", agencyId)
    .eq("id", params.id)
    .maybeSingle();

  if (!current) {
    return NextResponse.json({ ok: false, error: "That field isn't one of yours." }, { status: 404 });
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if ("label" in body) {
    const label = typeof body.label === "string" ? body.label.trim() : "";
    if (label.length < 2 || label.length > 40) {
      return NextResponse.json({ ok: false, error: "Give the field a name of a few words." }, { status: 400 });
    }
    patch.label = label;
  }

  if ("help" in body) {
    const help = typeof body.help === "string" ? body.help.trim() : "";
    patch.help = help ? help.slice(0, 120) : null;
  }

  if ("position" in body) {
    const position = Number(body.position);
    if (!Number.isInteger(position) || position < 0 || position > 999) {
      return NextResponse.json({ ok: false, error: "That position isn't valid." }, { status: 400 });
    }
    patch.position = position;
  }

  if ("archived" in body) {
    patch.archived = body.archived === true;
  }

  if ("options" in body) {
    const type = current.type as string;
    if (type !== "select" && type !== "multi_select") {
      return NextResponse.json(
        { ok: false, error: "Only a list field has options." },
        { status: 400 }
      );
    }
    const raw = Array.isArray(body.options) ? body.options : [];
    const options = Array.from(
      new Set(
        raw
          .filter((o): o is string => typeof o === "string")
          .map((o) => o.trim())
          .filter((o) => o.length > 0 && o.length <= 60)
      )
    ).slice(0, 40);
    if (options.length < 2) {
      return NextResponse.json({ ok: false, error: "A list needs at least two options." }, { status: 400 });
    }
    patch.options = options;
  }

  // Said out loud rather than ignored: a caller trying to change the type
  // deserves to know why it did not happen.
  if ("type" in body && body.type !== current.type) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "A field's type can't change once it holds data — it would reinterpret every value already recorded. Archive this one and add a new field instead.",
      },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("custom_fields")
    .update(patch)
    .eq("id", params.id)
    .eq("agency_id", agencyId)
    .select("id, entity, key, label, type, options, help, position, archived")
    .maybeSingle();

  if (error) {
    console.error("[custom-fields] update failed:", error.message);
    return NextResponse.json({ ok: false, error: "That didn't save." }, { status: 502 });
  }

  return NextResponse.json({ ok: true, field: data });
}
