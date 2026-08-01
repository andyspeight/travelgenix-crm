/**
 * POST /api/ask/act — Luna doing, rather than answering.
 *
 * Two phases, deliberately separate:
 *
 *   { action, targets, value }                → a PLAN. Writes nothing.
 *   { action, targets, value, confirm: true } → the plan, carried out.
 *
 * The split is the whole safety model. An agent sees the verb, the count and
 * the names before anything happens, and "Luna did something to 40 customers"
 * is never a discovery.
 *
 * TARGETS ARE NOT TRUSTED. They arrive as ids from the rows Luna showed, and
 * every one is re-read from the database scoped to this agency before it is
 * touched. An id from another workspace resolves to nothing and is silently
 * dropped, so a tampered request can only ever do less than it claimed, never
 * more. The names in the plan come from those re-read rows too — what the
 * agent confirms is what the server found, not what the browser said.
 *
 * NOTHING HERE SENDS A MESSAGE. Tasks, tags and sequence enrolments all land
 * in a queue a human works.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { apiAgencyId } from "@/lib/auth/session";
import { enforceRateLimit, clientKey } from "@/lib/ai/rate-limit";
import { emitEvent } from "@/lib/events/emit";
import {
  planAction,
  describeOutcome,
  cleanTag,
  findAction,
  MAX_TARGETS,
  type ActionId,
  type ActionTarget,
} from "@/lib/ask/actions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET — the sequences an agent can enrol into, so the picker has real names
 * rather than ids. Active ones only: adding someone to a paused chase looks
 * like it worked and then nothing happens.
 */
export async function GET() {
  const agencyId = await apiAgencyId();
  if (!agencyId) {
    return NextResponse.json({ ok: false, error: "No access to this workspace." }, { status: 403 });
  }
  const supabase = createClient();
  const { data } = await supabase
    .from("sequences")
    .select("id, name, auto_send")
    .eq("agency_id", agencyId)
    .eq("is_active", true)
    .order("name");

  return NextResponse.json({ ok: true, sequences: data ?? [] });
}

export async function POST(request: Request) {
  const agencyId = await apiAgencyId();
  if (!agencyId) {
    return NextResponse.json({ ok: false, error: "No access to this workspace." }, { status: 403 });
  }

  // Writes, so it is metered like the AI routes rather than left open.
  const limit = await enforceRateLimit(clientKey(request, "ask-act"), 20, 60_000);
  if (!limit.ok) {
    return NextResponse.json(
      { ok: false, error: "That's a lot of actions in a minute. Give it a moment." },
      { status: 429 }
    );
  }

  let body: {
    action?: unknown;
    targetIds?: unknown;
    value?: unknown;
    confirm?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const action = typeof body.action === "string" ? (body.action as ActionId) : ("" as ActionId);
  if (!findAction(action)) {
    return NextResponse.json({ ok: false, error: "Luna doesn't know how to do that." }, { status: 400 });
  }

  const requestedIds = Array.isArray(body.targetIds)
    ? (body.targetIds as unknown[])
        .filter((x): x is string => typeof x === "string")
        .slice(0, MAX_TARGETS + 1) // one over, so the ceiling can still refuse loudly
    : [];
  const value = typeof body.value === "string" ? body.value : "";

  const supabase = createClient();

  // ─── Re-read the targets, scoped ───────────────────────────────────────
  // This is the authorisation. Anything not in this agency simply is not here.
  const { data: householdRows } = requestedIds.length
    ? await supabase
        .from("households")
        .select("id, display_name, tags")
        .eq("agency_id", agencyId)
        .in("id", requestedIds)
    : { data: [] };

  const households = (householdRows ?? []) as {
    id: string;
    display_name: string;
    tags: string[] | null;
  }[];

  const targets: ActionTarget[] = households.map((h) => ({ id: h.id, name: h.display_name }));

  // ─── The sequence, if that is the verb ─────────────────────────────────
  let sequenceName: string | null = null;
  if (action === "enrol_sequence" && value) {
    const { data: seq } = await supabase
      .from("sequences")
      .select("id, name")
      .eq("agency_id", agencyId)
      .eq("id", value)
      .maybeSingle();
    sequenceName = (seq?.name as string | undefined) ?? null;
  }

  const planned = planAction({ action, targetIds: requestedIds, value }, targets, { sequenceName });
  if (!planned.ok) {
    return NextResponse.json({ ok: false, error: planned.error }, { status: 400 });
  }

  // Phase one: show the work. Nothing has been written.
  if (body.confirm !== true) {
    return NextResponse.json({ ok: true, plan: planned.plan, confirmed: false });
  }

  // ─── Phase two: do it ──────────────────────────────────────────────────
  const plan = planned.plan;
  const targetIds = plan.targets.map((t) => t.id);
  let done = 0;
  let skipped = 0;
  let label = value;

  try {
    if (action === "create_task") {
      const title = value.trim();
      label = title;
      const { data: inserted } = await supabase
        .from("tasks")
        .insert(
          targetIds.map((householdId) => ({
            agency_id: agencyId,
            household_id: householdId,
            title,
            description: "Created from Ask Luna.",
            status: "open",
            source: "ask",
          }))
        )
        .select("id");
      done = (inserted ?? []).length;
    }

    if (action === "add_tag") {
      const tag = cleanTag(value);
      label = tag;
      for (const household of households) {
        const existing = household.tags ?? [];
        // Already tagged is not a failure and not a write.
        if (existing.includes(tag)) {
          skipped++;
          continue;
        }
        const { error } = await supabase
          .from("households")
          .update({ tags: [...existing, tag] })
          .eq("id", household.id)
          .eq("agency_id", agencyId);
        if (!error) done++;
      }
    }

    if (action === "enrol_sequence") {
      label = sequenceName ?? "the sequence";
      // Anyone already enrolled stays as they are — re-enrolling would restart
      // a chase that may be halfway through, or already stopped on a reply.
      const { data: already } = await supabase
        .from("sequence_enrolments")
        .select("household_id")
        .eq("agency_id", agencyId)
        .eq("sequence_id", value)
        .in("household_id", targetIds);

      const enrolled = new Set(
        ((already ?? []) as { household_id: string | null }[])
          .map((r) => r.household_id)
          .filter((x): x is string => Boolean(x))
      );
      const fresh = targetIds.filter((id) => !enrolled.has(id));
      skipped = targetIds.length - fresh.length;

      if (fresh.length) {
        const { data: inserted } = await supabase
          .from("sequence_enrolments")
          .insert(
            fresh.map((householdId) => ({
              agency_id: agencyId,
              sequence_id: value,
              household_id: householdId,
              enrolled_at: new Date().toISOString(),
              steps_sent: 0,
              status: "active",
            }))
          )
          .select("id");
        done = (inserted ?? []).length;
      }
    }
  } catch (err) {
    console.error("[ask/act] failed:", err);
    return NextResponse.json(
      { ok: false, error: "That didn't finish. Some of it may have gone through — check before repeating it." },
      { status: 502 }
    );
  }

  // One event for the batch, not one per record: this was a single decision.
  await emitEvent(supabase, agencyId, {
    type: "ask.action",
    subjectType: "household",
    subjectId: targetIds[0] ?? agencyId,
    householdId: targetIds[0] ?? null,
    payload: { action, value: label, done, skipped, targets: targetIds.length },
  });

  return NextResponse.json({
    ok: true,
    confirmed: true,
    outcome: {
      action,
      done,
      skipped,
      summary: describeOutcome(action, done, skipped, label),
    },
  });
}
