/**
 * PATCH /api/tasks/[id]
 *
 * Updates a task's status (open / doing / done / snoozed / cancelled). The only
 * field the client may set is status, whitelisted against the task_status enum,
 * exactly like the trip-stage and journey-toggle routes. Agency-scoped.
 *
 * Side effects derived server-side, never trusted from the client:
 *   - done       -> stamp completed_at
 *   - snoozed    -> push due_at out by three days so it resurfaces later
 *   - reopened   -> clear completed_at
 */

import { NextResponse } from "next/server";
import { createClient, AGENCY_ID } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ALLOWED = ["open", "doing", "done", "snoozed", "cancelled"] as const;
type Status = (typeof ALLOWED)[number];

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const id = params.id;
  if (!id || !UUID_RE.test(id)) {
    return NextResponse.json({ ok: false, error: "Invalid task id" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const status = (body as { status?: unknown }).status;
  if (typeof status !== "string" || !ALLOWED.includes(status as Status)) {
    return NextResponse.json({ ok: false, error: "Unknown status" }, { status: 400 });
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const update: Record<string, unknown> = { status, updated_at: nowIso };

  if (status === "done") {
    update.completed_at = nowIso;
  } else if (status === "snoozed") {
    const later = new Date(now.getTime() + 3 * 86400000);
    update.due_at = later.toISOString();
    update.completed_at = null;
  } else {
    update.completed_at = null;
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from("tasks")
    .update(update)
    .eq("id", id)
    .eq("agency_id", AGENCY_ID)
    .select("id, status, due_at, completed_at")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ ok: false, error: "Task not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, task: data });
}
