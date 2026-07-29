/**
 * PATCH /api/cases/[id]
 *
 * Case lifecycle: start (open → in_progress), wait (→ waiting), resolve
 * (→ resolved, with the resolution text — the blueprint wants the outcome
 * recorded, not just a closed flag), reopen (resolved/closed → open).
 *
 * Resolving emits `case.resolved` with the time-to-resolve and whether the
 * SLA was met, so resolution-time reporting is free later. Agency-scoped.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { apiAgencyId } from "@/lib/auth/session";
import { emitEvent } from "@/lib/events/emit";
import type { CaseRow } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ACTIONS = new Set(["start", "wait", "resolve", "reopen"]);

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const id = params.id;
  if (!id || !UUID_RE.test(id)) {
    return NextResponse.json({ ok: false, error: "Invalid case id" }, { status: 400 });
  }

  let body: { action?: unknown; resolution?: unknown };
  try {
    body = (await request.json()) as { action?: unknown; resolution?: unknown };
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const action = typeof body.action === "string" && ACTIONS.has(body.action) ? body.action : null;
  if (!action) {
    return NextResponse.json({ ok: false, error: "Unknown action" }, { status: 400 });
  }

  const supabase = createClient();
  const agencyId = await apiAgencyId();
  if (!agencyId) {
    return NextResponse.json(
      { ok: false, error: "No access to this workspace." },
      { status: 403 }
    );
  }

  const { data: caseRow } = await supabase
    .from("cases")
    .select("*")
    .eq("id", id)
    .eq("agency_id", agencyId)
    .maybeSingle();

  if (!caseRow) {
    return NextResponse.json({ ok: false, error: "Case not found" }, { status: 404 });
  }

  const c = caseRow as CaseRow;
  const nowIso = new Date().toISOString();
  const isResolved = c.status === "resolved" || c.status === "closed";

  if (action === "reopen") {
    if (!isResolved) {
      return NextResponse.json({ ok: false, error: "Only a resolved case can be reopened" }, { status: 409 });
    }
    const { error } = await supabase
      .from("cases")
      .update({ status: "open", resolved_at: null })
      .eq("id", id)
      .eq("agency_id", agencyId);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, status: "open" });
  }

  if (isResolved) {
    return NextResponse.json({ ok: false, error: "This case is already resolved" }, { status: 409 });
  }

  if (action === "start" || action === "wait") {
    const status = action === "start" ? "in_progress" : "waiting";
    const { error } = await supabase
      .from("cases")
      .update({ status })
      .eq("id", id)
      .eq("agency_id", agencyId);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, status });
  }

  // resolve
  const resolution =
    typeof body.resolution === "string" && body.resolution.trim()
      ? body.resolution.trim().slice(0, 1000)
      : null;
  if (!resolution) {
    return NextResponse.json(
      { ok: false, error: "Record how it was resolved" },
      { status: 400 }
    );
  }

  const { error } = await supabase
    .from("cases")
    .update({ status: "resolved", resolved_at: nowIso, resolution })
    .eq("id", id)
    .eq("agency_id", agencyId);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  await emitEvent(supabase, agencyId, {
    type: "case.resolved",
    subjectType: "case",
    subjectId: id,
    householdId: c.household_id,
    payload: {
      case_type: c.case_type,
      priority: c.priority,
      resolution_minutes: Math.max(
        0,
        Math.round((new Date(nowIso).getTime() - new Date(c.opened_at).getTime()) / 60_000)
      ),
      within_sla: c.sla_due_at ? new Date(nowIso) <= new Date(c.sla_due_at) : null,
    },
  });

  if (c.household_id) {
    try {
      await supabase.from("interactions").insert({
        agency_id: agencyId,
        household_id: c.household_id,
        trip_id: c.trip_id,
        kind: "system",
        direction: "internal",
        subject: `Service case resolved: ${c.subject}`,
        body_summary: resolution,
        occurred_at: nowIso,
      });
    } catch {
      // Timeline write never fails the request.
    }
  }

  return NextResponse.json({ ok: true, status: "resolved" });
}
