/**
 * Household rollups — the denormalised counters stored on the household row
 * (lifetime_value, trips_count, next_departure). The dashboard, customer list
 * and reports read these constantly, so they are stored rather than joined —
 * but that means every trip mutation must refresh them or they drift.
 *
 * computeRollups is pure (trips in, values out) so it is unit-testable; the
 * API routes that mutate trips call refreshHouseholdRollups after their write.
 */

import type { Trip, TripStage } from "@/lib/supabase/types";

/** Stages that count as a real booking for value/count purposes. */
const REAL_STAGES: TripStage[] = ["booked", "pre_departure", "travelling", "returned"];
/** Stages that can still have a future departure worth surfacing. */
const UPCOMING_STAGES: TripStage[] = ["booked", "pre_departure", "travelling"];

export type Rollups = {
  lifetime_value: number;
  trips_count: number;
  next_departure: string | null;
};

export function computeRollups(
  trips: Pick<Trip, "stage" | "total_value" | "depart_date">[],
  now: Date
): Rollups {
  const real = trips.filter((t) => REAL_STAGES.includes(t.stage));
  const lifetime_value = real.reduce((s, t) => s + (t.total_value ?? 0), 0);

  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  const upcoming = trips
    .filter((t) => UPCOMING_STAGES.includes(t.stage) && t.depart_date)
    .map((t) => t.depart_date!)
    .filter((d) => {
      const dd = new Date(d);
      dd.setHours(0, 0, 0, 0);
      return !Number.isNaN(dd.getTime()) && dd.getTime() >= today.getTime();
    })
    .sort();

  return {
    lifetime_value,
    trips_count: real.length,
    next_departure: upcoming[0] ?? null,
  };
}

/**
 * Re-read a household's trips and write fresh rollups. Best-effort by design:
 * callers treat a failure here as non-fatal (the primary write already
 * succeeded) but it is logged so drift is visible.
 */
export async function refreshHouseholdRollups(
  db: { from: (table: string) => any }, // eslint-disable-line @typescript-eslint/no-explicit-any
  agencyId: string,
  householdId: string,
  opts: { setLastBookingAt?: boolean } = {}
): Promise<void> {
  const { data, error } = await db
    .from("trips")
    .select("stage, total_value, depart_date")
    .eq("agency_id", agencyId)
    .eq("household_id", householdId);

  if (error) {
    console.error("[rollups] read failed:", error.message);
    return;
  }

  const nowIso = new Date().toISOString();
  const rollups = computeRollups((data ?? []) as Trip[], new Date());

  const { error: writeErr } = await db
    .from("households")
    .update({
      ...rollups,
      ...(opts.setLastBookingAt ? { last_booking_at: nowIso } : {}),
      updated_at: nowIso,
    })
    .eq("id", householdId)
    .eq("agency_id", agencyId);

  if (writeErr) console.error("[rollups] write failed:", writeErr.message);
}
