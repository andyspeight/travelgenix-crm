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
import { createClient, AGENCY_ID } from "@/lib/supabase/server";
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
};

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const supabase = createClient();

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
      const saved = await getSavedSegment(supabase, AGENCY_ID, searchParams.seg);
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
    .eq("agency_id", AGENCY_ID);

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
    : await fetchHouseholdsForTokens(supabase, AGENCY_ID, tokens);

  // ─── Live counts for each saved segment chip ────────────────────────
  const segmentCounts: Record<string, number> = {};
  if (!isEmpty) {
    await Promise.all(
      SAVED_SEGMENTS.map(async (s) => {
        const rows = await fetchHouseholdsForTokens(
          supabase,
          AGENCY_ID,
          s.tokens
        );
        segmentCounts[s.id] = rows.length;
      })
    );
  }

  // ─── Saved segments + active journeys for the segment action bar ────
  const savedSegments = isEmpty ? [] : await listSavedSegments(supabase, AGENCY_ID);
  if (!isEmpty && savedSegments.length > 0) {
    await Promise.all(
      savedSegments.map(async (s) => {
        const rows = await fetchHouseholdsForTokens(supabase, AGENCY_ID, s.tokens);
        segmentCounts[s.id] = rows.length;
      })
    );
  }

  const { data: journeyRows } = isEmpty
    ? { data: [] }
    : await supabase
        .from("journeys")
        .select("id, name")
        .eq("agency_id", AGENCY_ID)
        .eq("is_active", true)
        .order("name");
  const journeys = (journeyRows ?? []) as { id: string; name: string }[];

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
            households={households}
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
