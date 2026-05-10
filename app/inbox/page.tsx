/**
 * Inbox — /inbox
 *
 * Server Component. Fetches the most recent inbound interactions and the
 * households they belong to (for the mini customer card on the right).
 *
 * The interactions table already has ai_priority and ai_reason populated
 * for the seeded high-priority items. Day 5 will run real Claude triage
 * on inbound messages as they arrive.
 */

import { Topbar } from "@/components/layout/topbar";
import { createClient, AGENCY_ID } from "@/lib/supabase/server";
import { InboxView } from "./inbox-view";
import { SparklesIcon } from "@/components/ui/icons";
import type {
  Household,
  Contact,
  Interaction,
} from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

export default async function InboxPage({
  searchParams,
}: {
  searchParams: { id?: string; lane?: string };
}) {
  const supabase = createClient();

  // Pull all inbound interactions for the agency, recent first
  const { data: interactions } = await supabase
    .from("interactions")
    .select("*")
    .eq("agency_id", AGENCY_ID)
    .eq("direction", "inbound")
    .order("occurred_at", { ascending: false })
    .limit(80);

  const ix = (interactions ?? []) as Interaction[];

  // Pull the households for everyone in the inbox (one query)
  const householdIds = Array.from(
    new Set(ix.map((i) => i.household_id).filter(Boolean) as string[])
  );

  const { data: households } = householdIds.length
    ? await supabase
        .from("households")
        .select("*")
        .in("id", householdIds)
    : { data: [] };

  // Pull lead contacts for the same households (for the mini-card name resolution)
  const { data: contacts } = householdIds.length
    ? await supabase
        .from("contacts")
        .select("*")
        .in("household_id", householdIds)
    : { data: [] };

  return (
    <>
      <Topbar
        title="Inbox"
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
            <SparklesIcon width={12} height={12} style={{ color: "var(--tg-accent-dark)" }} />
            Luna triages every inbound message
          </span>
        }
      />

      <InboxView
        interactions={ix}
        households={(households ?? []) as Household[]}
        contacts={(contacts ?? []) as Contact[]}
        initialSelectedId={searchParams.id ?? null}
        initialLane={(searchParams.lane as "today" | "week" | "later" | "all") ?? "today"}
      />
    </>
  );
}
