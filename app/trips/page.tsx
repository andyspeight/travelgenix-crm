/**
 * Trips — the pipeline Kanban. /trips
 *
 * Server Component (mirrors app/customers/page.tsx):
 *   - Fetches all trips for the agency, newest activity first
 *   - Joins the household display name + id for each card (one extra query,
 *     mapped in memory — keeps the board to two round-trips)
 *   - Passes everything to the client board, which owns drag, optimistic
 *     stage changes, and the cancelled-trips toggle
 *
 * Empty state points at the same /api/seed flow the customers page uses, so a
 * fresh database tells you what to do rather than showing a blank board.
 */

import { Topbar } from "@/components/layout/topbar";
import { createClient, AGENCY_ID } from "@/lib/supabase/server";
import { TripsBoard, type BoardTrip } from "./trips-view";
import { PlaneIcon } from "@/components/ui/icons";
import type { Trip, Household } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

export default async function TripsPage() {
  const supabase = createClient();

  // ─── Count for the empty-state check ────────────────────────────────
  const { count, error: countError } = await supabase
    .from("trips")
    .select("*", { count: "exact", head: true })
    .eq("agency_id", AGENCY_ID);

  if (countError) {
    return (
      <>
        <Topbar title="Trips" />
        <div style={{ padding: 28, maxWidth: 1400, margin: "0 auto", width: "100%" }}>
          <ErrorBanner message={countError.message} />
        </div>
      </>
    );
  }

  if ((count ?? 0) === 0) {
    return (
      <>
        <Topbar title="Trips" />
        <EmptyBoard />
      </>
    );
  }

  // ─── Fetch trips ────────────────────────────────────────────────────
  const { data: trips, error: tripsError } = await supabase
    .from("trips")
    .select("*")
    .eq("agency_id", AGENCY_ID)
    .order("updated_at", { ascending: false });

  if (tripsError) {
    return (
      <>
        <Topbar title="Trips" />
        <div style={{ padding: 28, maxWidth: 1400, margin: "0 auto", width: "100%" }}>
          <ErrorBanner message={tripsError.message} />
        </div>
      </>
    );
  }

  const rows = (trips ?? []) as Trip[];

  // ─── Resolve household names in one query ───────────────────────────
  const householdIds = Array.from(new Set(rows.map((t) => t.household_id)));
  const householdMap = new Map<string, string>();

  if (householdIds.length > 0) {
    const { data: households } = await supabase
      .from("households")
      .select("id, display_name")
      .in("id", householdIds);

    for (const h of (households ?? []) as Pick<Household, "id" | "display_name">[]) {
      householdMap.set(h.id, h.display_name);
    }
  }

  const boardTrips: BoardTrip[] = rows.map((t) => ({
    ...t,
    household_name: householdMap.get(t.household_id) ?? "Unknown household",
  }));

  return (
    <>
      <Topbar title="Trips" />
      <TripsBoard trips={boardTrips} />
    </>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────
function EmptyBoard() {
  return (
    <div style={{ padding: 28, maxWidth: 1400, margin: "0 auto", width: "100%" }}>
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
            width: 56,
            height: 56,
            borderRadius: 14,
            background: "var(--bg-subtle)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--text-subtle)",
            marginBottom: 16,
          }}
        >
          <PlaneIcon width={24} height={24} />
        </div>
        <h2
          style={{
            fontSize: 20,
            fontWeight: 700,
            margin: "0 0 6px",
            color: "var(--text)",
            letterSpacing: "-0.01em",
          }}
        >
          No trips yet
        </h2>
        <p
          style={{
            fontSize: 14,
            color: "var(--text-muted)",
            margin: "0 0 18px",
            maxWidth: 460,
            marginInline: "auto",
            lineHeight: 1.55,
          }}
        >
          The pipeline fills as enquiries come in. To explore the board with
          sample data, seed the demo agency first.
        </p>
        <a
          href="/api/seed"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            background: "var(--tg-primary)",
            border: "1px solid var(--tg-primary)",
            borderRadius: 6,
            padding: "8px 14px",
            color: "white",
            fontSize: 13,
            fontWeight: 500,
            textDecoration: "none",
          }}
        >
          Seed demo data
        </a>
      </div>
    </div>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
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
      <span
        style={{
          fontFamily: '"JetBrains Mono", monospace',
          fontSize: 12,
          color: "var(--text-muted)",
        }}
      >
        {message}
      </span>
    </div>
  );
}
