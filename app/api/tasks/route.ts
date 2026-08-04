/**
 * POST /api/tasks
 *
 * Create a task from scratch — a free-form title, an optional due date and
 * priority, optionally linked to a customer. This is the generic counterpart
 * to /api/customers/[id]/task (which is preset-driven for the 360 quick
 * actions): here the queue itself, /tasks, can create work that isn't tied to
 * a canned follow-up.
 *
 * Agency-scoped. A linked customer, when given, is re-checked against the
 * agency so a task can't be attached to another workspace's record.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { apiAgencyId } from "@/lib/auth/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Turn a date-input value (YYYY-MM-DD) or an ISO string into an ISO due time,
 *  or null if it's absent/unparseable. Date-only lands at 09:00 local-ish. */
function toDueIso(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const v = raw.trim();
  const candidate = DATE_ONLY_RE.test(v) ? `${v}T09:00:00` : v;
  const t = Date.parse(candidate);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

export async function POST(request: Request) {
  let body: { title?: unknown; due_at?: unknown; priority?: unknown; household_id?: unknown; assigned_to?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const title = typeof body.title === "string" ? body.title.trim().slice(0, 200) : "";
  if (!title) {
    return NextResponse.json({ ok: false, error: "A task needs a title." }, { status: 400 });
  }

  // Priority is a small int: 0 normal, 1 high, 2 urgent. Anything else clamps.
  const rawPriority = typeof body.priority === "number" ? Math.round(body.priority) : 0;
  const priority = Math.max(0, Math.min(2, rawPriority));

  const dueAt = toDueIso(body.due_at);

  const householdId =
    typeof body.household_id === "string" && UUID_RE.test(body.household_id) ? body.household_id : null;
  const assignedTo =
    typeof body.assigned_to === "string" && UUID_RE.test(body.assigned_to) ? body.assigned_to : null;

  const supabase = createClient();
  const agencyId = await apiAgencyId();
  if (!agencyId) {
    return NextResponse.json({ ok: false, error: "No access to this workspace." }, { status: 403 });
  }

  // A linked customer must belong to this agency.
  if (householdId) {
    const { data: hh } = await supabase
      .from("households")
      .select("id")
      .eq("id", householdId)
      .eq("agency_id", agencyId)
      .maybeSingle();
    if (!hh) {
      return NextResponse.json({ ok: false, error: "That customer wasn't found." }, { status: 404 });
    }
  }

  // An assignee must be a member of this agency.
  if (assignedTo) {
    const { data: member } = await supabase
      .from("users")
      .select("id")
      .eq("id", assignedTo)
      .eq("agency_id", agencyId)
      .maybeSingle();
    if (!member) {
      return NextResponse.json({ ok: false, error: "That teammate wasn't found." }, { status: 404 });
    }
  }

  const { data, error } = await supabase
    .from("tasks")
    .insert({
      agency_id: agencyId,
      household_id: householdId,
      assigned_to: assignedTo,
      title,
      status: "open",
      priority,
      due_at: dueAt,
      source: "manual",
    })
    .select("id, title, due_at, priority, household_id, assigned_to")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, task: data });
}
