/**
 * Reports — /reports
 *
 * Server Component. Fetches all trips for the agency once, hands them to the
 * client view which owns the date toggle (this year / last 12 months / all
 * time) and computes the four reports client-side so flipping ranges is
 * instant with no refetch.
 *
 * All figures are gross booking VALUE (total_value). Commission is not
 * captured in the data yet, so there is deliberately no margin report — better
 * an honest revenue view than a column of zeros.
 */

import { Topbar } from "@/components/layout/topbar";
import { createClient, AGENCY_ID } from "@/lib/supabase/server";
import { ReportsView, type ReportTrip, type ReportHousehold } from "./reports-view";
import { ChartIcon } from "@/components/ui/icons";
import type { Trip } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const supabase = createClient();

  const { data: trips, error } = await supabase
    .from("trips")
    .select(
      "id, household_id, stage, destination, destination_country, total_value, source, depart_date, return_date, created_at"
    )
    .eq("agency_id", AGENCY_ID);

  if (error) {
    return (
      <>
        <Topbar title="Reports" />
        <div style={{ padding: 28, maxWidth: 1200, margin: "0 auto" }}>
          <div
            style={{
              padding: "12px 16px",
              background: "rgba(239, 68, 68, 0.06)",
              border: "1px solid rgba(239, 68, 68, 0.2)",
              borderRadius: 10,
              fontSize: 13,
              color: "var(--text)",
            }}
          >
            <strong style={{ color: "var(--error)" }}>Supabase error.</strong>{" "}
            <span style={{ color: "var(--text-muted)", fontSize: 12 }}>{error.message}</span>
          </div>
        </div>
      </>
    );
  }

  const rows = (trips ?? []) as Pick<
    Trip,
    "id" | "household_id" | "stage" | "destination" | "destination_country" | "total_value" | "source" | "depart_date" | "return_date" | "created_at"
  >[];

  // Household summaries for the customer-mix reports (new vs repeat, value bands).
  const { data: households } = await supabase
    .from("households")
    .select("id, customer_since, lifetime_value, trips_count")
    .eq("agency_id", AGENCY_ID);

  if (rows.length === 0) {
    return (
      <>
        <Topbar title="Reports" />
        <div style={{ padding: 28, maxWidth: 1200, margin: "0 auto" }}>
          <div
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 14,
              padding: "60px 28px",
              textAlign: "center",
            }}
          >
            <div
              style={{
                width: 56, height: 56, borderRadius: 14, background: "var(--bg-subtle)",
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                color: "var(--text-subtle)", marginBottom: 16,
              }}
            >
              <ChartIcon width={24} height={24} />
            </div>
            <h2 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 6px", color: "var(--text)" }}>
              Nothing to report yet
            </h2>
            <p style={{ fontSize: 14, color: "var(--text-muted)", margin: 0 }}>
              Reports populate as trips and bookings come in.
            </p>
          </div>
        </div>
      </>
    );
  }

  const reportTrips: ReportTrip[] = rows.map((t) => ({
    id: t.id,
    householdId: t.household_id,
    stage: t.stage,
    destination: t.destination,
    country: t.destination_country,
    value: t.total_value ?? 0,
    source: t.source,
    // Prefer depart_date for time-bucketing; fall back to created_at.
    date: t.depart_date ?? t.created_at,
    departDate: t.depart_date,
    returnDate: t.return_date,
    createdAt: t.created_at,
  }));

  const reportHouseholds: ReportHousehold[] = (households ?? []).map(
    (h: { id: string; customer_since: string | null; lifetime_value: number | null; trips_count: number | null }) => ({
      id: h.id,
      customerSince: h.customer_since,
      lifetimeValue: h.lifetime_value ?? 0,
      tripsCount: h.trips_count ?? 0,
    })
  );

  return (
    <>
      <Topbar title="Reports" />
      <ReportsView trips={reportTrips} households={reportHouseholds} />
    </>
  );
}
