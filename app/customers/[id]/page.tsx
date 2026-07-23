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
import { computeNextSteps } from "@/lib/customer/next-steps";
import {
  currentConsent,
  type ConsentLedgerRow,
  type ConsentChannel,
  type ChannelState,
} from "@/lib/consent/state";
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
  const [contactsRes, tripsRes, interactionsRes, prefsRes, consentsRes] = await Promise.all([
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
    // Consent ledger — a missing table (migration not run) degrades to an
    // honest "not set up yet" note in the panel.
    supabase
      .from("consents")
      .select("contact_id, channel, granted, occurred_at, source")
      .eq("household_id", params.id)
      .eq("agency_id", AGENCY_ID),
  ]);

  const householdRow = household as Household;
  const contactRows = (contactsRes.data ?? []) as Contact[];
  const tripRows = (tripsRes.data ?? []) as Trip[];
  const prefRows = (prefsRes.data ?? []) as Preference[];
  const interactionRows = (interactionsRes.data ?? []) as Interaction[];

  // ─── Consent state (per adult contact, per channel) ─────────────────
  const consentLedgerMissing = Boolean(
    consentsRes.error && /consents/.test(consentsRes.error.message ?? "")
  );
  const consentState = currentConsent(
    (consentsRes.data ?? []) as ConsentLedgerRow[]
  );
  const adultContacts = contactRows.filter((c) => c.role !== "child");
  const consentStateByContact: Record<
    string,
    Partial<Record<ConsentChannel, ChannelState>>
  > = {};
  for (const c of adultContacts) {
    const channels = consentState.get(c.id);
    if (!channels) continue;
    consentStateByContact[c.id] = Object.fromEntries(channels);
  }
  const consentContacts = adultContacts.map((c) => ({
    id: c.id,
    name: [c.first_name, c.last_name].filter(Boolean).join(" "),
    role: c.role,
  }));

  // ─── Luna next steps (deterministic, from real rows) ────────────────
  const nextSteps = computeNextSteps(householdRow, contactRows, tripRows, interactionRows);
  const latestInboundId =
    interactionRows.find(
      (ix) => ix.direction === "inbound" && ["email_in", "chat", "enquiry"].includes(ix.kind)
    )?.id ?? null;

  // ─── Deterministic prediction cards (the trustworthy half) ──────────
  // Computed from real data. We leave Sarah Thompson on her hand-built demo
  // cards (detail-view falls back when predictionCards is undefined) so the
  // showcase record stays pristine; every other customer gets real scores.
  const isSarah = householdRow.display_name === "Sarah & James Thompson";

  let predictionCards;
  if (!isSarah) {
    const risk = computeRisk(contactRows, tripRows);
    const opp = computeOpportunity(householdRow, tripRows);

    // Trip match: use the cached AI suggestion if one has been generated,
    // otherwise fall back to an honest deterministic card from preferences.
    const aiMatch = householdRow.ai_match;
    let matchCard;
    if (aiMatch && aiMatch.suggestions?.length > 0) {
      const top = aiMatch.suggestions[0];
      const extra =
        aiMatch.suggestions.length > 1
          ? ` Also worth a look: ${aiMatch.suggestions[1].destination}.`
          : "";
      matchCard = {
        tag: "Trip match",
        confidence: `${top.fit}%`,
        fill: top.fit,
        title: aiMatch.headline || `${top.destination}, a strong fit`,
        reason: `${top.reason}${extra}`,
        variant: "match" as const,
      };
    } else {
      const prefValues = prefRows.map((p) => p.value).filter(Boolean);
      matchCard =
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
              title: "Refresh brief to generate a match",
              reason: "Luna suggests destinations from trip history and tags.",
              variant: "match" as const,
            };
    }

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
        interactions={interactionRows}
        preferences={prefRows}
        predictionCards={predictionCards}
        nextSteps={nextSteps}
        latestInboundId={latestInboundId}
        consentContacts={consentContacts}
        consentState={consentStateByContact}
        consentLedgerMissing={consentLedgerMissing}
      />
    </>
  );
}
