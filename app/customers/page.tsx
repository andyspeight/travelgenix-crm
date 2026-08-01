/**
 * Customers — the smart segmentation list.
 *
 * Server Component:
 *   - Reads tokens from URL search params (?q=… or ?seg=… or ?tokens=…)
 *   - Queries Supabase via fetchHouseholdsForTokens
 *   - Passes households + parsed tokens to the client component
 *
 * Why URL-driven: queries become shareable links. Andy can send a colleague
 * "/customers?q=greece%20families" and they see the same view.
 *
 * The seed banner appears only when the database is empty.
 */

import Link from "next/link";
import { Topbar } from "@/components/layout/topbar";
import {
  deriveAttributes,
  findAttribute,
  type DerivedAttribute,
  type AttributeId,
} from "@/lib/attributes/derive";
import { createClient } from "@/lib/supabase/server";
import { requireAgencyId } from "@/lib/auth/session";
import { CustomersView } from "./customers-view";
import { SeedPrompt } from "./seed-prompt";
import { headers } from "next/headers";
import { SAVED_SEGMENTS, parseQueryToTokens, type Token } from "@/lib/segmentation/parse";
import { resolveTokens } from "@/lib/segmentation/resolve";
import { enforceRateLimit, clientKeyFromHeaders } from "@/lib/ai/rate-limit";
import { fetchHouseholdsForTokens } from "@/lib/segmentation/query";
import { listSavedSegments, getSavedSegment } from "@/lib/segmentation/segments";
import { AddCustomer } from "./add-customer";

export const dynamic = "force-dynamic";

type SearchParams = {
  q?: string;
  seg?: string;
  density?: string;
  /** A derived attribute to narrow by, e.g. ?attr=passport_risk. */
  attr?: string;
};

/** The shapes the attribute deriver needs, joined by household. */
type AttrContact = {
  household_id: string | null;
  first_name: string;
  email: string | null;
  phone: string | null;
  passport_expiry: string | null;
};
type AttrTrip = {
  household_id: string | null;
  stage: string;
  depart_date: string | null;
  return_date: string | null;
  destination: string | null;
};

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const supabase = createClient();
  const agencyId = await requireAgencyId();

  // ─── Resolve tokens from URL ────────────────────────────────────────
  let tokens: Token[] = [];
  let activeSegmentId: string | null = null;
  const rawQuery = searchParams.q ?? "";

  if (searchParams.seg) {
    const builtin = SAVED_SEGMENTS.find((s) => s.id === searchParams.seg);
    if (builtin) {
      tokens = builtin.tokens;
      activeSegmentId = builtin.id;
    } else {
      // Not a built-in — try a user-saved segment from the DB.
      const saved = await getSavedSegment(supabase, agencyId, searchParams.seg);
      if (saved) {
        tokens = saved.tokens;
        activeSegmentId = saved.id;
      }
    }
  } else if (rawQuery) {
    // Claude-backed, falls back to the rules-based parser on any failure.
    // Rate-limited per client: this is an AI spend reachable from a bare URL
    // parameter, so it gets the same meter as the API routes. Over the limit
    // the deterministic parser still answers — nothing breaks, it just stops
    // spending.
    const limit = await enforceRateLimit(
      clientKeyFromHeaders(headers(), "segment-resolve"),
      20,
      60_000
    );
    tokens = limit.ok ? await resolveTokens(rawQuery) : parseQueryToTokens(rawQuery);
  }

  // ─── Total count for the banner / empty-state check ─────────────────
  const { count: totalCount, error: countError } = await supabase
    .from("households")
    .select("*", { count: "exact", head: true })
    .eq("agency_id", agencyId);

  if (countError) {
    return (
      <>
        <Topbar title="Customers" />
        <div style={{ padding: 28 }}>
          <ErrorBanner message={countError.message} />
        </div>
      </>
    );
  }

  const isEmpty = (totalCount ?? 0) === 0;

  // ─── Fetch the actual rows (only if not empty) ──────────────────────
  const households = isEmpty
    ? []
    : await fetchHouseholdsForTokens(supabase, agencyId, tokens);

  // ─── Live counts for each saved segment chip ────────────────────────
  const segmentCounts: Record<string, number> = {};
  if (!isEmpty) {
    await Promise.all(
      SAVED_SEGMENTS.map(async (s) => {
        const rows = await fetchHouseholdsForTokens(
          supabase,
          agencyId,
          s.tokens
        );
        segmentCounts[s.id] = rows.length;
      })
    );
  }

  // ─── Saved segments + active journeys for the segment action bar ────
  const savedSegments = isEmpty ? [] : await listSavedSegments(supabase, agencyId);
  if (!isEmpty && savedSegments.length > 0) {
    await Promise.all(
      savedSegments.map(async (s) => {
        const rows = await fetchHouseholdsForTokens(supabase, agencyId, s.tokens);
        segmentCounts[s.id] = rows.length;
      })
    );
  }

  const { data: journeyRows } = isEmpty
    ? { data: [] }
    : await supabase
        .from("journeys")
        .select("id, name")
        .eq("agency_id", agencyId)
        .eq("is_active", true)
        .order("name");
  const journeys = (journeyRows ?? []) as { id: string; name: string }[];

  // ─── Derived attributes ─────────────────────────────────────────────
  // Facts nobody typed: who is departing, whose passport will not make it,
  // who has gone quiet. Computed on read from the rows as they are right now
  // (lib/attributes/derive), never stored, so they cannot go stale.
  const attributesByHousehold: Record<string, DerivedAttribute[]> = {};
  const attrFilter = findAttribute(searchParams.attr ?? "")?.id ?? null;

  if (!isEmpty) {
    const householdIds = households.map((h) => h.id);
    const [{ data: contactRows }, { data: tripRows }, { data: ixRows }, { data: quoteRows }, { data: suppressedRows }] =
      await Promise.all([
        supabase
          .from("contacts")
          .select("household_id, first_name, email, phone, passport_expiry")
          .eq("agency_id", agencyId),
        supabase
          .from("trips")
          .select("household_id, stage, depart_date, return_date, destination")
          .eq("agency_id", agencyId),
        supabase
          .from("interactions")
          .select("household_id, occurred_at")
          .eq("agency_id", agencyId)
          .order("occurred_at", { ascending: false })
          .limit(2000),
        supabase
          .from("quotes")
          .select("household_id, status")
          .eq("agency_id", agencyId)
          .in("status", ["sent", "viewed"]),
        supabase.from("email_suppressions").select("email").eq("agency_id", agencyId),
      ]);

    const byHousehold = <T extends { household_id: string | null }>(rows: T[] | null) => {
      const map = new Map<string, T[]>();
      for (const row of rows ?? []) {
        if (!row.household_id) continue;
        const list = map.get(row.household_id) ?? [];
        list.push(row);
        map.set(row.household_id, list);
      }
      return map;
    };

    const contactsBy = byHousehold((contactRows ?? []) as AttrContact[]);
    const tripsBy = byHousehold((tripRows ?? []) as AttrTrip[]);
    const quotesBy = byHousehold((quoteRows ?? []) as { household_id: string | null; status: string }[]);

    const lastContact = new Map<string, string>();
    for (const ix of (ixRows ?? []) as { household_id: string | null; occurred_at: string }[]) {
      if (!ix.household_id || lastContact.has(ix.household_id)) continue;
      lastContact.set(ix.household_id, ix.occurred_at);
    }

    const suppressed = new Set(
      ((suppressedRows ?? []) as { email: string }[]).map((r) => r.email.toLowerCase())
    );

    const now = new Date();
    for (const id of householdIds) {
      const household = households.find((h) => h.id === id)!;
      const contacts = contactsBy.get(id) ?? [];
      attributesByHousehold[id] = deriveAttributes({
        now,
        household: {
          lifetime_value: household.lifetime_value,
          last_booking_at: household.last_booking_at,
          trips_count: household.trips_count,
        },
        contacts,
        trips: tripsBy.get(id) ?? [],
        lastContactAt: lastContact.get(id) ?? null,
        hasLiveQuote: (quotesBy.get(id) ?? []).length > 0,
        emailSuppressed: contacts.some((c) => c.email && suppressed.has(c.email.toLowerCase())),
        // The consent ledger is per contact; marketing_opt_in on the contact
        // is the roll-up the customers list already carries.
        marketingConsent: "granted",
      });
    }
  }

  const filteredHouseholds = attrFilter
    ? households.filter((h) => (attributesByHousehold[h.id] ?? []).some((a) => a.id === attrFilter))
    : households;

  // Live counts per attribute, so a filter chip can say how many before it is
  // pressed — and say nothing rather than a zero that looks like an error.
  const attributeCounts: Record<string, number> = {};
  for (const attrs of Object.values(attributesByHousehold)) {
    for (const a of attrs) attributeCounts[a.id] = (attributeCounts[a.id] ?? 0) + 1;
  }

  const density = searchParams.density === "compact" ? "compact" : "comfortable";

  return (
    <>
      <Topbar
        title="Customers"
        actions={
          <span style={{ display: "inline-flex", gap: 8 }}>
            <Link
              href="/customers/import"
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
              Import CSV
            </Link>
            <AddCustomer />
          </span>
        }
      />

      <div
        style={{
          padding: 28,
          maxWidth: 1400,
          margin: "0 auto",
          width: "100%",
        }}
      >
        {isEmpty ? (
          <SeedPrompt />
        ) : (
          <CustomersView
            initialQuery={rawQuery}
            initialTokens={tokens}
            initialActiveSegment={activeSegmentId}
            households={filteredHouseholds}
            attributes={attributesByHousehold}
            attributeCounts={attributeCounts}
            activeAttribute={attrFilter}
            totalCount={totalCount ?? 0}
            segmentCounts={segmentCounts}
            savedSegments={savedSegments}
            journeys={journeys}
            density={density}
          />
        )}
      </div>
    </>
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
