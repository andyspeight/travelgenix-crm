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

import { Topbar } from "@/components/layout/topbar";
import { createClient, AGENCY_ID } from "@/lib/supabase/server";
import { CustomersView } from "./customers-view";
import { SeedPrompt } from "./seed-prompt";
import { SAVED_SEGMENTS, type Token } from "@/lib/segmentation/parse";
import { resolveTokens } from "@/lib/segmentation/resolve";
import { fetchHouseholdsForTokens } from "@/lib/segmentation/query";
import { PlusIcon, SparklesIcon } from "@/components/ui/icons";

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
    const seg = SAVED_SEGMENTS.find((s) => s.id === searchParams.seg);
    if (seg) {
      tokens = seg.tokens;
      activeSegmentId = seg.id;
    }
  } else if (rawQuery) {
    // Claude-backed, falls back to the rules-based parser on any failure.
    tokens = await resolveTokens(rawQuery);
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

  const density = searchParams.density === "compact" ? "compact" : "comfortable";

  return (
    <>
      <Topbar
        title="Customers"
        actions={
          <button
            style={{
              background: "var(--tg-primary)",
              border: "1px solid var(--tg-primary)",
              borderRadius: 6,
              padding: "6px 10px",
              color: "white",
              fontSize: 12.5,
              fontWeight: 500,
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <PlusIcon width={14} height={14} />
            Add customer
          </button>
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
