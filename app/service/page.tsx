/**
 * Service — the case queue. /service
 *
 * Server Component. Loads every case plus household names and trip context,
 * and hands them to the client view that owns the status tabs, the
 * priority-then-SLA ordering and the lifecycle actions.
 *
 * If the cases table doesn't exist yet the page says which migration to run.
 */

import { Topbar } from "@/components/layout/topbar";
import { createClient, AGENCY_ID } from "@/lib/supabase/server";
import { ZapIcon } from "@/components/ui/icons";
import type { CaseRow } from "@/lib/supabase/types";
import { ServiceView } from "./service-view";
import { NewCase } from "./new-case";

export const dynamic = "force-dynamic";

export default async function ServicePage() {
  const supabase = createClient();

  const [{ data: caseRows, error: caseErr }, { data: households }, { data: trips }] =
    await Promise.all([
      supabase
        .from("cases")
        .select("*")
        .eq("agency_id", AGENCY_ID)
        .order("priority", { ascending: true })
        .order("sla_due_at", { ascending: true, nullsFirst: false })
        .limit(500),
      supabase.from("households").select("id, display_name").eq("agency_id", AGENCY_ID),
      supabase
        .from("trips")
        .select("id, household_id, destination, depart_date, stage")
        .eq("agency_id", AGENCY_ID),
    ]);

  const migrationMissing = Boolean(caseErr && /cases/.test(caseErr.message ?? ""));

  const cases = (caseRows ?? []) as CaseRow[];
  const nameById = Object.fromEntries(
    (households ?? []).map((h: { id: string; display_name: string }) => [h.id, h.display_name])
  );
  const tripRows = (trips ?? []) as {
    id: string;
    household_id: string;
    destination: string | null;
    depart_date: string | null;
    stage: string;
  }[];
  const tripMeta = Object.fromEntries(
    tripRows.map((t) => [t.id, { destination: t.destination, depart_date: t.depart_date, stage: t.stage }])
  );

  // The new-case modal offers households and, per household, live trips.
  const householdOptions = (households ?? [])
    .map((h: { id: string; display_name: string }) => ({ id: h.id, label: h.display_name }))
    .sort((a: { label: string }, b: { label: string }) => a.label.localeCompare(b.label));
  const tripOptions = tripRows
    .filter((t) => t.stage !== "cancelled" && t.stage !== "returned")
    .map((t) => ({
      id: t.id,
      household_id: t.household_id,
      label: `${t.destination ?? "Destination TBC"}${
        t.depart_date
          ? ` · ${new Date(t.depart_date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`
          : ""
      } · ${t.stage.replace("_", " ")}`,
    }));

  return (
    <>
      <Topbar
        title="Service"
        actions={
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
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
              A traveller in trouble outranks everything
            </span>
            <NewCase households={householdOptions} trips={tripOptions} />
          </div>
        }
      />
      {migrationMissing ? (
        <div style={{ padding: 32 }}>
          <div
            style={{
              maxWidth: 520,
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 12,
              padding: 24,
              fontSize: 13.5,
              color: "var(--text-muted)",
              lineHeight: 1.6,
            }}
          >
            <div style={{ fontWeight: 700, color: "var(--text)", marginBottom: 6 }}>
              One migration to run
            </div>
            The cases table isn&apos;t in the database yet. Run{" "}
            <code style={{ fontSize: 12 }}>supabase/migrations/20260724090000_cases.sql</code> in
            the Supabase SQL editor and refresh this page.
          </div>
        </div>
      ) : (
        <ServiceView cases={cases} nameById={nameById} tripMeta={tripMeta} />
      )}
    </>
  );
}
