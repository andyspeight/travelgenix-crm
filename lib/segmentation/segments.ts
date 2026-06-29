/**
 * Saved-segment persistence helpers.
 *
 * These read the `segments` table (added in 20260628120000_segments.sql). The
 * table is optional infrastructure: if a deployment hasn't run that migration
 * yet, every helper degrades to "no saved segments" rather than throwing, so
 * the Customers page keeps working with just the built-in segments.
 */

import { SupabaseClient } from "@supabase/supabase-js";
import type { Token } from "./parse";

export type SavedSegmentRow = {
  id: string;
  label: string;
  query: string | null;
  tokens: Token[];
};

/** Postgres "relation does not exist" — the migration hasn't been run. */
function isMissingTable(error: { code?: string } | null): boolean {
  return error?.code === "42P01";
}

export async function listSavedSegments(
  supabase: SupabaseClient,
  agencyId: string
): Promise<SavedSegmentRow[]> {
  const { data, error } = await supabase
    .from("segments")
    .select("id, label, query, tokens")
    .eq("agency_id", agencyId)
    .order("created_at", { ascending: false });

  if (error) {
    if (!isMissingTable(error)) console.error("[listSavedSegments]", error.message);
    return [];
  }
  return (data ?? []).map((r: { id: string; label: string; query: string | null; tokens: unknown }) => ({
    id: r.id,
    label: r.label,
    query: r.query,
    tokens: Array.isArray(r.tokens) ? (r.tokens as Token[]) : [],
  }));
}

export async function getSavedSegment(
  supabase: SupabaseClient,
  agencyId: string,
  id: string
): Promise<SavedSegmentRow | null> {
  const { data, error } = await supabase
    .from("segments")
    .select("id, label, query, tokens")
    .eq("agency_id", agencyId)
    .eq("id", id)
    .maybeSingle();

  if (error || !data) return null;
  return {
    id: data.id,
    label: data.label,
    query: data.query,
    tokens: Array.isArray(data.tokens) ? (data.tokens as Token[]) : [],
  };
}
