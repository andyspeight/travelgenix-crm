/**
 * Customer Detail — /customers/[id]
 *
 * Server Component. Fetches the household and all its related data
 * (contacts, trips, interactions, preferences) in parallel.
 *
 * Composition:
 *   - Delta strip (what changed since last view) — Sarah pre-cached, generic for others
 *   - AI brief — read from the ai_brief column we seeded
 *   - Predictive cards — hand-crafted for Sarah, generic for others until day 5
 *   - Timeline — interactions in reverse chronological order
 *   - Right column: next-steps panel, trip cards, household graph, preferences, compliance
 *   - Listening footer
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import { Topbar } from "@/components/layout/topbar";
import { createClient, AGENCY_ID } from "@/lib/supabase/server";
import {
  SparklesIcon,
  PlusIcon,
  ClockIcon,
} from "@/components/ui/icons";
import { CustomerDetailView } from "./detail-view";
import { computeRisk, computeOpportunity } from "@/lib/scoring/customer";
import type {
  Household,
  Contact,
  Trip,
  Interaction,
} from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

type Preference = {
  id: string;
  household_id: string;
  category: string;
  value: string;
};

export default async function CustomerDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createClient();

  // Fetch the household first so we can 404 cleanly
  const { data: household, error: hhErr } = await supabase
    .from("households")
    .select("*")
    .eq("id", params.id)
    .eq("agency_id", AGENCY_ID)
    .single();

  if (hhErr || !household) {
    notFound();
  }

  // Then fetch related data in parallel
  const [contactsRes, tripsRes, interactionsRes, prefsRes] = await Promise.all([
    supabase
      .from("contacts")
      .select("*")
      .eq("household_id", params.id)
      .order("role"),
    supabase
      .from("trips")
      .select("*")
      .eq("household_id", params.id)
      .order("depart_date", { ascending: false, nullsFirst: false }),
    supabase
      .from("interactions")
      .select("*")
      .eq("household_id", params.id)
      .order("occurred_at", { ascending: false })
      .limit(20),
    supabase
      .from("preferences")
      .select("*")
      .eq("household_id", params.id),
  ]);

  const householdRow = household as Household;
  const contactRows = (contactsRes.data ?? []) as Contact[];
  const tripRows = (tripsRes.data ?? []) as Trip[];
  const prefRows = (prefsRes.data ?? []) as Preference[];

  // ─── Deterministic prediction cards (the trustworthy half) ──────────
  // Computed from real data. We leave Sarah Thompson on her hand-built demo
  // cards (detail-view falls back when predictionCards is undefined) so the
  // showcase record stays pristine; every other customer gets real scores.
  const isSarah = householdRow.display_name === "Sarah & James Thompson";

  let predictionCards;
  if (!isSarah) {
    const risk = computeRisk(contactRows, tripRows);
    const opp = computeOpportunity(householdRow, tripRows);

    // Trip match is derived honestly from recorded preferences for now; the
    // richer AI match reasoning lands in a later iteration and feeds the brief.
    const prefValues = prefRows.map((p) => p.value).filter(Boolean);
    const matchCard =
      prefValues.length > 0
        ? {
            tag: "Trip match",
            confidence: "From prefs",
            fill: 60,
            title: "Matched to recorded preferences",
            reason: `Based on: ${prefValues.slice(0, 3).join(", ")}.`,
            variant: "match" as const,
          }
        : {
            tag: "Trip match",
            confidence: "—",
            fill: 0,
            title: "Awaiting preference signals",
            reason: "Build preferences over time to surface ideas here.",
            variant: "match" as const,
          };

    predictionCards = [
      {
        tag: "Opportunity",
        confidence: opp.confidence != null ? `${opp.confidence}%` : "—",
        fill: opp.fill,
        title: opp.title,
        reason: opp.reason,
        variant: "opportunity" as const,
      },
      matchCard,
      {
        tag: "Risk",
        confidence: risk.level,
        fill: risk.fill,
        title: risk.title,
        reason: risk.reason,
        variant: "risk" as const,
      },
    ];
  }

  return (
    <>
      <Topbar
        title={householdRow.display_name}
        actions={
          <Link
            href="/customers"
            style={{
              background: "transparent",
              border: "1px solid var(--border)",
              borderRadius: 6,
              padding: "6px 10px",
              color: "var(--text-muted)",
              fontSize: 12.5,
              fontWeight: 500,
              textDecoration: "none",
            }}
          >
            ← All customers
          </Link>
        }
      />

      <CustomerDetailView
        household={householdRow}
        contacts={contactRows}
        trips={tripRows}
        interactions={(interactionsRes.data ?? []) as Interaction[]}
        preferences={prefRows}
        predictionCards={predictionCards}
      />
    </>
  );
}
