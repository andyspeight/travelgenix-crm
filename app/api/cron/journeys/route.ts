/**
 * GET /api/cron/journeys — the nightly auto-pilot run.
 *
 * Until now Luna's journeys only ran when somebody pressed "Run now", which
 * means an agency that forgets never gets its passport reminders, rebooking
 * nudges or post-trip follow-ups. An automation that needs a human to
 * remember it is not automation.
 *
 * WHO IS ASKING. A schedule has no session, so this authenticates with a
 * shared secret instead. Vercel Cron sends `Authorization: Bearer $CRON_SECRET`
 * automatically, and the route refuses everything when that env var is unset —
 * no secret, no schedule. The middleware lets this path through the sign-in
 * gate for the same reason it lets the email webhook through: a scheduler
 * cannot hold a cookie.
 *
 * ACROSS EVERY AGENCY. Unlike every other route, this one is deliberately not
 * scoped to one tenant — it works the whole estate. So it uses the system
 * client, loops agencies, and passes each agency id explicitly. One agency's
 * failure is caught and logged so it cannot stop the rest: a bad row in one
 * workspace must never mean nobody else's reminders go out.
 *
 * SAFE TO RUN DAILY. The runner dedupes against journey_runs, so a candidate
 * that has already fired never fires twice — running every night does not nag
 * a customer every night. And nothing is sent: tasks and notes are written,
 * emails are drafted for review.
 */

import { NextResponse } from "next/server";
import { createSystemClient } from "@/lib/supabase/server";
import { runJourneysForAgency } from "@/lib/journeys/run";
import { runSequencesForAgency } from "@/lib/sequences/runner";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ ok: false, error: "Schedule not enabled" }, { status: 404 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Bad token" }, { status: 401 });
  }

  const supabase = createSystemClient();
  const startedAt = new Date().toISOString();

  const { data: agencyRows, error } = await supabase.from("agencies").select("id, name");
  if (error) {
    console.error("[cron/journeys] could not list agencies:", error.message);
    // Record the failure: a run that could not proceed must still leave a
    // trace, or the health panel reads it as "never ran" and nobody can tell
    // a broken schedule from an unconfigured one.
    await supabase.from("cron_runs").insert({
      job: "journeys",
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      status: "failed",
      error: error.message,
    });
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const agencies = (agencyRows ?? []) as { id: string; name: string }[];
  const results: {
    agency: string;
    fired: number;
    sequences?: { enrolled: number; sent: number; queued: number; stopped: number };
    error?: string;
  }[] = [];

  for (const agency of agencies) {
    try {
      const result = await runJourneysForAgency(supabase, agency.id);
      // Sequences run in the same pass: they share the trigger matcher, and
      // a chase that stops on a reply needs evaluating every night whether or
      // not a step is due.
      const seq = await runSequencesForAgency(supabase, agency.id);
      results.push({
        agency: agency.name,
        fired: result.totalFired,
        sequences: {
          enrolled: seq.enrolled,
          sent: seq.sent,
          queued: seq.queued,
          stopped: seq.stopped,
        },
        ...(result.error || seq.error ? { error: result.error ?? seq.error } : {}),
      });
    } catch (err) {
      // One workspace failing must never stop the others.
      const message = err instanceof Error ? err.message : "unknown error";
      console.error(`[cron/journeys] ${agency.name} failed:`, message);
      results.push({ agency: agency.name, fired: 0, error: message });
    }
  }

  const totalFired = results.reduce((s, r) => s + r.fired, 0);
  const failed = results.filter((r) => r.error).length;
  console.log(
    `[cron/journeys] ${agencies.length} agencies, ${totalFired} actions queued${
      failed ? `, ${failed} failed` : ""
    }`
  );

  // The heartbeat. Its ABSENCE is the signal the health panel reads: a
  // schedule that stops does not error, it just goes quiet.
  await supabase.from("cron_runs").insert({
    job: "journeys",
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    status: failed === 0 ? "ok" : failed === agencies.length ? "failed" : "partial",
    agencies: agencies.length,
    actions: totalFired,
    detail: { results },
  });

  return NextResponse.json({ ok: true, agencies: agencies.length, totalFired, results });
}
