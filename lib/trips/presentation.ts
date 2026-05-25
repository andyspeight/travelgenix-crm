/**
 * Trip presentation helpers — shared by the Trips Kanban (/trips) and the
 * customer detail view. Single source of truth for stage colours, ordering,
 * money/date formatting and country flags so the two screens never drift.
 */

import type { TripStage } from "@/lib/supabase/types";

// ─── Stage meta ─────────────────────────────────────────────────────────
// Colours match the stagePill() map in app/customers/[id]/detail-view.tsx
// exactly, so a trip looks identical on the board and on the customer page.

export type StageMeta = {
  key: TripStage;
  label: string;
  bg: string;
  fg: string;
};

export const STAGE_META: Record<TripStage, StageMeta> = {
  enquiry: {
    key: "enquiry",
    label: "Enquiry",
    bg: "rgba(245, 158, 11, 0.1)",
    fg: "var(--warning)",
  },
  quoted: {
    key: "quoted",
    label: "Quoted",
    bg: "rgba(59, 130, 246, 0.1)",
    fg: "var(--info)",
  },
  booked: {
    key: "booked",
    label: "Booked",
    bg: "rgba(16, 185, 129, 0.1)",
    fg: "var(--success)",
  },
  pre_departure: {
    key: "pre_departure",
    label: "Pre-departure",
    bg: "rgba(245, 158, 11, 0.12)",
    fg: "var(--warning)",
  },
  travelling: {
    key: "travelling",
    label: "Travelling",
    bg: "rgba(16, 185, 129, 0.12)",
    fg: "var(--success)",
  },
  returned: {
    key: "returned",
    label: "Returned",
    bg: "var(--bg-subtle)",
    fg: "var(--text-muted)",
  },
  cancelled: {
    key: "cancelled",
    label: "Cancelled",
    bg: "rgba(239, 68, 68, 0.08)",
    fg: "var(--error)",
  },
};

/**
 * The columns shown on the board, in pipeline order. Cancelled is deliberately
 * excluded — it is not a pipeline stage, it is an exit. The board can reveal
 * cancelled trips via a toggle, but they never get their own column.
 */
export const BOARD_STAGES: TripStage[] = [
  "enquiry",
  "quoted",
  "booked",
  "pre_departure",
  "travelling",
  "returned",
];

/**
 * Stages a user is allowed to drag a card INTO on the board. Cancelled is not
 * a drop target — cancelling is a deliberate action, not an accidental drag.
 */
export const DROPPABLE_STAGES: TripStage[] = BOARD_STAGES;

// ─── Formatting ─────────────────────────────────────────────────────────

export function formatMoney(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n >= 1000) return `£${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  return `£${n.toLocaleString("en-GB")}`;
}

export function formatDate(s: string | null | undefined): string {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * Whole pounds, comma-grouped — used for column totals where the rounded "k"
 * form would hide meaningful precision (a column of small enquiries).
 */
export function formatMoneyFull(n: number): string {
  return `£${Math.round(n).toLocaleString("en-GB")}`;
}

// ─── Country flags ──────────────────────────────────────────────────────
// Mirrors the subset in detail-view; falls back to a neutral globe.

const FLAGS: Record<string, string> = {
  GR: "🇬🇷", IT: "🇮🇹", ES: "🇪🇸", PT: "🇵🇹", FR: "🇫🇷", GB: "🇬🇧",
  US: "🇺🇸", CA: "🇨🇦", MX: "🇲🇽", JP: "🇯🇵", VN: "🇻🇳", ID: "🇮🇩",
  MV: "🇲🇻", AE: "🇦🇪", TR: "🇹🇷", HR: "🇭🇷", IS: "🇮🇸", NO: "🇳🇴",
  AT: "🇦🇹", CY: "🇨🇾", JE: "🇯🇪", FO: "🇫🇴", MA: "🇲🇦", NG: "🇳🇬",
  GH: "🇬🇭", JO: "🇯🇴", AR: "🇦🇷", AQ: "🇦🇶", EC: "🇪🇨", CR: "🇨🇷",
  MU: "🇲🇺", CV: "🇨🇻",
};

export function flagFor(country: string | null | undefined): string {
  if (!country) return "🌍";
  return FLAGS[country.toUpperCase()] ?? "🌍";
}

// ─── AI predictions ─────────────────────────────────────────────────────

/**
 * Pulls a close probability (0–100) out of the trip.ai_predictions JSONB if
 * present. Tolerant of 0–1 or 0–100 storage. Returns null when absent so the
 * card can simply omit the confidence bar rather than render a fake 0%.
 */
export function closeProbability(
  predictions: Record<string, unknown> | null | undefined
): number | null {
  if (!predictions) return null;
  const raw =
    (predictions.close_probability as number | undefined) ??
    (predictions.closeProbability as number | undefined);
  if (raw == null || Number.isNaN(raw)) return null;
  const pct = raw <= 1 ? raw * 100 : raw;
  return Math.max(0, Math.min(100, Math.round(pct)));
}

/**
 * Days until departure (negative = already departed). Null when no date.
 */
export function daysUntil(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86400000);
}
