/**
 * Journeys — Luna's auto-pilot. /journeys
 *
 * Server Component. Loads the agency's journeys plus the data the matcher needs,
 * then computes "eligible now" for each journey as a read-only preview (no
 * writes happen on a page load, only when the agent presses Run). Also loads the
 * recent run log so the page can show what Luna has already done.
 *
 * The interactive bits (install starter journeys, run, pause) live in the client
 * view and post to the /api/journeys routes.
 */

import { Topbar } from "@/components/layout/topbar";
import { createClient, AGENCY_ID } from "@/lib/supabase/server";
import { ZapIcon } from "@/components/ui/icons";
import {
  evaluateJourney,
  buildLastContactMap,
  describeTrigger,
  describeAction,
  type Journey,
  type JourneyRun,
  type EvalContext,
} from "@/lib/journeys/engine";
import type { Household, Trip, Contact } from "@/lib/supabase/types";
import { JourneysView, type JourneyCard, type RunFeedItem } from "./journeys-view";

export const dynamic = "force-dynamic";

export default async function JourneysPage() {
  const supabase = createClient();

  const [
    { data: journeyRows },
    { data: households },
    { data: trips },
    { data: contacts },
    { data: ixRows },
    { data: runRows },
  ] = await Promise.all([
    supabase.from("journeys").select("*").eq("agency_id", AGENCY_ID).order("created_at"),
    supabase
      .from("households")
      .select("id, display_name, customer_since, last_booking_at, trips_count")
      .eq("agency_id", AGENCY_ID),
    supabase
      .from("trips")
      .select("id, household_id, stage, destination, depart_date, return_date")
      .eq("agency_id", AGENCY_ID),
    supabase
      .from("contacts")
      .select("id, household_id, first_name, last_name, passport_expiry, role, email")
      .eq("agency_id", AGENCY_ID),
    supabase.from("interactions").select("household_id, occurred_at").eq("agency_id", AGENCY_ID),
    supabase
      .from("journey_runs")
      .select("*")
      .order("fired_at", { ascending: false })
      .limit(14),
  ]);

  const journeys = (journeyRows ?? []) as Journey[];
  const hh = (households ?? []) as Household[];
  const nameById = new Map(hh.map((h) => [h.id, h.display_name]));

  const ctx: EvalContext = {
    now: new Date(),
    households: hh,
    trips: (trips ?? []) as Trip[],
    contacts: (contacts ?? []) as Contact[],
    lastContactByHousehold: buildLastContactMap(
      (ixRows ?? []) as { household_id: string | null; occurred_at: string }[]
    ),
  };

  const cards: JourneyCard[] = journeys.map((j) => ({
    id: j.id,
    name: j.name,
    description: j.description,
    triggerLabel: describeTrigger(j),
    actionKind: j.action_kind,
    actionLabel: describeAction(j),
    isActive: j.is_active,
    lastRunAt: j.last_run_at,
    eligibleNow: j.is_active ? evaluateJourney(j, ctx).length : 0,
  }));

  // Resolve journey names for the run feed (runs reference journey_id only),
  // and lead emails so a reviewed draft can open pre-addressed in email.
  const journeyNameById = new Map(journeys.map((j) => [j.id, j.name]));
  const leadEmailByHousehold = new Map<string, string>();
  for (const c of (contacts ?? []) as (Contact & { role?: string; email?: string | null })[]) {
    if (c.email && (c.role === "lead" || !leadEmailByHousehold.has(c.household_id))) {
      leadEmailByHousehold.set(c.household_id, c.email);
    }
  }
  const runs = (runRows ?? []) as JourneyRun[];
  const feed: RunFeedItem[] = runs.map((r) => {
    const result = (r.result ?? {}) as { summary?: string; action?: string; subject?: string; body?: string };
    return {
      id: r.id,
      journeyName: journeyNameById.get(r.journey_id) ?? "Journey",
      household: r.household_id ? nameById.get(r.household_id) ?? null : null,
      email: r.household_id ? leadEmailByHousehold.get(r.household_id) ?? null : null,
      summary: result.summary ?? "Action taken",
      action: result.action ?? "",
      subject: result.subject ?? null,
      body: result.body ?? null,
      status: r.status,
      firedAt: r.fired_at,
    };
  });

  const activeCount = cards.filter((c) => c.isActive).length;
  const eligibleTotal = cards.reduce((s, c) => s + c.eligibleNow, 0);

  return (
    <>
      <Topbar
        title="Journeys"
        actions={
          <span
            style={{
              fontSize: 11.5,
              color: "var(--text-muted)",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <ZapIcon width={12} height={12} style={{ color: "var(--tg-accent-dark)" }} />
            Luna works these in the background
          </span>
        }
      />
      <JourneysView
        cards={cards}
        feed={feed}
        activeCount={activeCount}
        eligibleTotal={eligibleTotal}
      />
    </>
  );
}
