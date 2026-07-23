/**
 * Quotes — the sales story of every priced proposal. /quotes
 *
 * Server Component. Loads all quotes plus trip context (destination,
 * departure) and household names, computes the deterministic Quote Rescue
 * alerts server-side (lib/quotes/rescue.ts), and hands everything to the
 * client view.
 *
 * If the quotes table doesn't exist yet the page says which migration to run.
 */

import { Topbar } from "@/components/layout/topbar";
import { createClient, AGENCY_ID } from "@/lib/supabase/server";
import { NoteIcon } from "@/components/ui/icons";
import { rescueAlerts, type QuoteTripContext } from "@/lib/quotes/rescue";
import type { Quote } from "@/lib/supabase/types";
import { QuotesView } from "./quotes-view";
import { NewQuote } from "./new-quote";

export const dynamic = "force-dynamic";

export default async function QuotesPage() {
  const supabase = createClient();

  const [{ data: quoteRows, error: qErr }, { data: tripRows }, { data: households }] =
    await Promise.all([
      supabase
        .from("quotes")
        .select("*")
        .eq("agency_id", AGENCY_ID)
        .order("created_at", { ascending: false })
        .limit(500),
      supabase
        .from("trips")
        .select("id, household_id, destination, depart_date, stage, reference")
        .eq("agency_id", AGENCY_ID),
      supabase.from("households").select("id, display_name").eq("agency_id", AGENCY_ID),
    ]);

  const migrationMissing = Boolean(qErr && /quotes/.test(qErr.message ?? ""));

  const quotes = (quoteRows ?? []) as Quote[];
  const trips = (tripRows ?? []) as {
    id: string;
    household_id: string;
    destination: string | null;
    depart_date: string | null;
    stage: string;
    reference: string | null;
  }[];

  const tripsById = new Map<string, QuoteTripContext>(
    trips.map((t) => [t.id, { depart_date: t.depart_date, destination: t.destination }])
  );
  const nameById = Object.fromEntries(
    (households ?? []).map((h: { id: string; display_name: string }) => [h.id, h.display_name])
  );

  const alerts = rescueAlerts(quotes, tripsById);

  // Trips a new quote can be raised against: still selling (enquiry/quoted).
  const quotableTrips = trips
    .filter((t) => t.stage === "enquiry" || t.stage === "quoted")
    .map((t) => ({
      id: t.id,
      label: `${nameById[t.household_id] ?? "Unknown"} · ${t.destination ?? "Destination TBC"}${
        t.depart_date
          ? ` · ${new Date(t.depart_date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`
          : ""
      }`,
    }));

  return (
    <>
      <Topbar
        title="Quotes"
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
              <NoteIcon width={12} height={12} style={{ color: "var(--tg-accent-dark)" }} />
              No quote left to die quietly
            </span>
            <NewQuote trips={quotableTrips} />
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
            The quotes table isn&apos;t in the database yet. Run{" "}
            <code style={{ fontSize: 12 }}>supabase/migrations/20260723150000_quotes.sql</code> in
            the Supabase SQL editor and refresh this page.
          </div>
        </div>
      ) : (
        <QuotesView
          quotes={quotes}
          alerts={alerts}
          nameById={nameById}
          tripMeta={Object.fromEntries(
            trips.map((t) => [
              t.id,
              { destination: t.destination, depart_date: t.depart_date },
            ])
          )}
        />
      )}
    </>
  );
}
