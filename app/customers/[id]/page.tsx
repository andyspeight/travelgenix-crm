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

  return (
    <>
      <Topbar
        title={(household as Household).display_name}
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
        household={household as Household}
        contacts={(contactsRes.data ?? []) as Contact[]}
        trips={(tripsRes.data ?? []) as Trip[]}
        interactions={(interactionsRes.data ?? []) as Interaction[]}
        preferences={(prefsRes.data ?? []) as Preference[]}
      />
    </>
  );
}
