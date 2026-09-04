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

/** "£4,250" — whole units, the currency's own symbol where en-GB knows it. */
export function formatMoney(amount: number | null, currency = "GBP"): string {
  if (amount == null || !isFinite(amount)) return "";
  try {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
      minimumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${currency} ${Math.round(amount).toLocaleString("en-GB")}`;
  }
}

/**
 * What a customer can do with a quote right now. "open" is the only state
 * with actions; an expiry in the past is treated as expired even before the
 * nightly job marks the row, so a customer can never accept a lapsed price.
 */
export type QuoteState = "open" | "expired" | "accepted" | "declined" | "unavailable";

export function quoteState(
  q: { status: string; expiresAt: string | null },
  now: Date = new Date()
): QuoteState {
  if (q.status === "accepted") return "accepted";
  if (q.status === "declined") return "declined";
  if (q.status === "expired") return "expired";
  if (q.status !== "sent" && q.status !== "viewed") return "unavailable";
  const exp = parse(q.expiresAt);
  if (exp && exp.getTime() < now.getTime()) return "expired";
  return "open";
}

export type QuoteDisplayStatus = { label: string; badge: "decide" | "expired" | "accepted" | "declined" | "off" };

export function quoteStatus(state: QuoteState): QuoteDisplayStatus {
  switch (state) {
    case "open":
      return { label: "Awaiting your decision", badge: "decide" };
    case "expired":
      return { label: "Expired", badge: "expired" };
    case "accepted":
      return { label: "Accepted", badge: "accepted" };
    case "declined":
      return { label: "Declined", badge: "declined" };
    default:
      return { label: "No longer available", badge: "off" };
  }
}

/** "£1,296.50" when there are pence, "£1,300" when there are not. */
export function formatAmount(amount: number | null, currency = "GBP"): string {
  if (amount == null || !isFinite(amount)) return "";
  const whole = Math.abs(amount - Math.round(amount)) < 0.005;
  try {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency,
      minimumFractionDigits: whole ? 0 : 2,
      maximumFractionDigits: whole ? 0 : 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(whole ? 0 : 2)}`;
  }
}

/** "240 KB", "1.2 MB". */
export function formatBytes(n: number | null): string {
  if (n == null || !isFinite(n) || n <= 0) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
