/** Small presentation helpers for the customer portal. */

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
    const left = sameYear
      ? `${start.getUTCDate()} ${MONTHS[start.getUTCMonth()]}`
      : formatDate(a);
    return `${left} – ${formatDate(b)}`;
  }
  return formatDate(a) || formatDate(b);
}

export type TripDisplayStatus = { label: string; badge: "upcoming" | "travelling" | "returned" };

export function tripStatus(stage: string): TripDisplayStatus {
  if (stage === "travelling") return { label: "Travelling now", badge: "travelling" };
  if (stage === "returned") return { label: "Completed", badge: "returned" };
  return { label: "Upcoming", badge: "upcoming" };
}

const KIND_ICON: Record<string, string> = {
  flight: "✈️",
  hotel: "🏨",
  transfer: "🚗",
  insurance: "🛡️",
  experience: "🎫",
  cruise: "🚢",
  rail: "🚆",
  car: "🚗",
};

export function componentIcon(kind: string): string {
  return KIND_ICON[kind.toLowerCase()] ?? "📌";
}
