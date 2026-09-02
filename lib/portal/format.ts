/** Presentation helpers for the customer portal. Pure; no emoji, no I/O. */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function parse(iso: string | null): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

/** "12 Jun 2026" */
export function formatDate(iso: string | null): string {
  const d = parse(iso);
  if (!d) return "";
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** "12–19 Jun 2026" or "28 Jun – 4 Jul 2026", collapsing shared month/year. */
export function formatRange(a: string | null, b: string | null): string {
  const start = parse(a);
  const end = parse(b);
  if (start && end) {
    const sameYear = start.getUTCFullYear() === end.getUTCFullYear();
    const sameMonth = sameYear && start.getUTCMonth() === end.getUTCMonth();
    if (sameMonth) {
      return `${start.getUTCDate()}–${end.getUTCDate()} ${MONTHS[end.getUTCMonth()]} ${end.getUTCFullYear()}`;
    }
    const left = sameYear ? `${start.getUTCDate()} ${MONTHS[start.getUTCMonth()]}` : formatDate(a);
    return `${left} – ${formatDate(b)}`;
  }
  return formatDate(a) || formatDate(b);
}

/** Whole days from today (UTC) until a date; negative if past; null if unknown. */
export function daysUntil(iso: string | null, now: Date = new Date()): number | null {
  const d = parse(iso);
  if (!d) return null;
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const then = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return Math.round((then - today) / 86_400_000);
}

export type TripDisplayStatus = { label: string; badge: "upcoming" | "travelling" | "returned" };

export function tripStatus(stage: string): TripDisplayStatus {
  if (stage === "travelling") return { label: "Travelling now", badge: "travelling" };
  if (stage === "returned") return { label: "Completed", badge: "returned" };
  return { label: "Upcoming", badge: "upcoming" };
}

export type ComponentDisplayStatus = { label: string; cls: "ok" | "pending" | "off" };

export function componentStatus(status: string): ComponentDisplayStatus {
  const s = status.toLowerCase();
  if (s === "confirmed") return { label: "Confirmed", cls: "ok" };
  if (s === "cancelled") return { label: "Cancelled", cls: "off" };
  return { label: "Pending", cls: "pending" };
}

/** "Sarah Thompson" -> "ST"; "Sunshine Travel" -> "ST"; "Maldives" -> "M". */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  const first = parts[0]![0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1]![0] ?? "" : "";
  return (first + last).toUpperCase();
}

/**
 * A deterministic horizon-glow position for a destination plate, so a list of
 * trips reads as different places rather than one repeated tile. 58%–92%.
 */
export function glowFor(text: string): string {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0;
  return `${58 + (h % 35)}%`;
}
