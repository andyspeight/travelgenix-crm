/**
 * Travel trend detection — blueprint differentiator 9 and §18: "LUNA should
 * proactively report rising destination interest, falling conversion,
 * increasing response times, unexpected cancellation patterns…"
 *
 * Method: honest period-over-period deltas. The current window is compared
 * with the window immediately before it, on real rows only. Every trend
 * states both numbers and both sample sizes, and anything below the minimum
 * sample simply is not reported — a "trend" built on three data points is a
 * coincidence wearing a suit.
 *
 * Deterministic, pure, no I/O.
 */

export type TrendDirection = "up" | "down";
export type TrendTone = "good" | "bad" | "neutral";

export type Trend = {
  kind:
    | "destination_demand"
    | "enquiry_volume"
    | "response_time"
    | "conversion"
    | "cancellations"
    | "booking_value";
  direction: TrendDirection;
  tone: TrendTone;
  headline: string;
  detail: string; // both numbers, both windows — the receipt
};

export type TrendInputs = {
  /** Trips with creation + stage; cancellations read from stage. */
  trips: {
    stage: string;
    destination: string | null;
    total_value: number | null;
    created_at: string;
    updated_at?: string | null;
  }[];
  /** Enquiries with receipt + response stamps + destination + status. */
  enquiries: {
    destination: string | null;
    received_at: string;
    first_response_at: string | null;
    status: string;
  }[];
  now?: Date;
  /** Window length in days (current vs the previous window). */
  windowDays?: number;
};

const DAY_MS = 86_400_000;
const MIN_SAMPLE = 4; // below this per window, say nothing

type Window = { from: number; to: number };

const inWindow = (iso: string | null | undefined, w: Window): boolean => {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return t >= w.from && t < w.to;
};

const pct = (from: number, to: number): number =>
  from === 0 ? 100 : Math.round(((to - from) / from) * 100);

export function detectTrends(inputs: TrendInputs): Trend[] {
  const now = inputs.now ?? new Date();
  const days = inputs.windowDays ?? 60;
  const current: Window = { from: now.getTime() - days * DAY_MS, to: now.getTime() + 1 };
  const previous: Window = { from: now.getTime() - 2 * days * DAY_MS, to: current.from };
  const windowLabel = `last ${days} days vs the ${days} before`;

  const trends: Trend[] = [];

  // ─── Enquiry volume ─────────────────────────────────────────────────
  const enqNow = inputs.enquiries.filter((e) => inWindow(e.received_at, current));
  const enqPrev = inputs.enquiries.filter((e) => inWindow(e.received_at, previous));
  if (enqNow.length >= MIN_SAMPLE && enqPrev.length >= MIN_SAMPLE) {
    const change = pct(enqPrev.length, enqNow.length);
    if (Math.abs(change) >= 25) {
      trends.push({
        kind: "enquiry_volume",
        direction: change > 0 ? "up" : "down",
        tone: change > 0 ? "good" : "bad",
        headline: `Enquiries ${change > 0 ? "up" : "down"} ${Math.abs(change)}%`,
        detail: `${enqNow.length} vs ${enqPrev.length} (${windowLabel}).`,
      });
    }
  }

  // ─── Destination demand (interest = enquiries + new trips naming it) ─
  const interest = (w: Window): Map<string, number> => {
    const m = new Map<string, number>();
    const bump = (d: string | null) => {
      if (!d) return;
      const key = d.trim();
      if (!key) return;
      m.set(key, (m.get(key) ?? 0) + 1);
    };
    for (const e of inputs.enquiries) if (inWindow(e.received_at, w)) bump(e.destination);
    for (const t of inputs.trips) if (inWindow(t.created_at, w)) bump(t.destination);
    return m;
  };
  const intNow = interest(current);
  const intPrev = interest(previous);
  const allDests = new Set([...intNow.keys(), ...intPrev.keys()]);
  let bestRiser: { dest: string; from: number; to: number } | null = null;
  let bestFaller: { dest: string; from: number; to: number } | null = null;
  for (const dest of allDests) {
    const from = intPrev.get(dest) ?? 0;
    const to = intNow.get(dest) ?? 0;
    if (to >= 3 && to >= from * 2 && to - from >= 2) {
      if (!bestRiser || to - from > bestRiser.to - bestRiser.from) bestRiser = { dest, from, to };
    }
    if (from >= 3 && to <= from / 2) {
      if (!bestFaller || from - to > bestFaller.from - bestFaller.to) bestFaller = { dest, from, to };
    }
  }
  if (bestRiser) {
    trends.push({
      kind: "destination_demand",
      direction: "up",
      tone: "good",
      headline: `${bestRiser.dest} interest is rising`,
      detail: `${bestRiser.to} enquiries/trips vs ${bestRiser.from} (${windowLabel}). Worth stock, content and a campaign.`,
    });
  }
  if (bestFaller) {
    trends.push({
      kind: "destination_demand",
      direction: "down",
      tone: "neutral",
      headline: `${bestFaller.dest} interest is cooling`,
      detail: `${bestFaller.to} enquiries/trips vs ${bestFaller.from} (${windowLabel}).`,
    });
  }

  // ─── First-response time ────────────────────────────────────────────
  const respMinutes = (w: Window): number[] =>
    inputs.enquiries
      .filter((e) => inWindow(e.received_at, w) && e.first_response_at)
      .map((e) =>
        Math.max(
          0,
          (new Date(e.first_response_at!).getTime() - new Date(e.received_at).getTime()) / 60_000
        )
      );
  const rNow = respMinutes(current);
  const rPrev = respMinutes(previous);
  if (rNow.length >= MIN_SAMPLE && rPrev.length >= MIN_SAMPLE) {
    const avg = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
    const aNow = avg(rNow);
    const aPrev = avg(rPrev);
    const change = pct(aPrev, aNow);
    if (Math.abs(change) >= 25) {
      const fmt = (m: number) => (m >= 90 ? `${(m / 60).toFixed(1)}h` : `${Math.round(m)}m`);
      trends.push({
        kind: "response_time",
        direction: change > 0 ? "up" : "down",
        tone: change > 0 ? "bad" : "good", // slower is worse
        headline: `First responses ${change > 0 ? `${Math.abs(change)}% slower` : `${Math.abs(change)}% faster`}`,
        detail: `Average ${fmt(aNow)} vs ${fmt(aPrev)} (${windowLabel}, ${rNow.length} vs ${rPrev.length} answered enquiries).`,
      });
    }
  }

  // ─── Enquiry conversion ─────────────────────────────────────────────
  const conv = (w: Window) => {
    const inW = inputs.enquiries.filter(
      (e) => inWindow(e.received_at, w) && e.status !== "new" // still-open enquiries can't be judged
    );
    const converted = inW.filter((e) => e.status === "converted").length;
    return { total: inW.length, converted };
  };
  const cNow = conv(current);
  const cPrev = conv(previous);
  if (cNow.total >= MIN_SAMPLE && cPrev.total >= MIN_SAMPLE) {
    const rateNow = Math.round((cNow.converted / cNow.total) * 100);
    const ratePrev = Math.round((cPrev.converted / cPrev.total) * 100);
    if (Math.abs(rateNow - ratePrev) >= 15) {
      trends.push({
        kind: "conversion",
        direction: rateNow > ratePrev ? "up" : "down",
        tone: rateNow > ratePrev ? "good" : "bad",
        headline: `Enquiry conversion ${rateNow > ratePrev ? "up" : "down"} to ${rateNow}%`,
        detail: `${cNow.converted}/${cNow.total} converted vs ${cPrev.converted}/${cPrev.total} (${ratePrev}%) — ${windowLabel}.`,
      });
    }
  }

  // ─── Cancellations ──────────────────────────────────────────────────
  const cancels = (w: Window) =>
    inputs.trips.filter((t) => t.stage === "cancelled" && inWindow(t.updated_at ?? t.created_at, w))
      .length;
  const kNow = cancels(current);
  const kPrev = cancels(previous);
  if (kNow >= 3 && kNow >= Math.max(1, kPrev) * 2) {
    trends.push({
      kind: "cancellations",
      direction: "up",
      tone: "bad",
      headline: `Cancellations are up: ${kNow} vs ${kPrev}`,
      detail: `${windowLabel}. Worth checking for a common supplier, destination or booking pattern.`,
    });
  }

  // ─── Average booking value ──────────────────────────────────────────
  const bookedValues = (w: Window): number[] =>
    inputs.trips
      .filter(
        (t) =>
          ["booked", "pre_departure", "travelling", "returned"].includes(t.stage) &&
          inWindow(t.created_at, w) &&
          (t.total_value ?? 0) > 0
      )
      .map((t) => t.total_value!);
  const bNow = bookedValues(current);
  const bPrev = bookedValues(previous);
  if (bNow.length >= MIN_SAMPLE && bPrev.length >= MIN_SAMPLE) {
    const avg = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
    const aNow = avg(bNow);
    const aPrev = avg(bPrev);
    const change = pct(aPrev, aNow);
    if (Math.abs(change) >= 20) {
      trends.push({
        kind: "booking_value",
        direction: change > 0 ? "up" : "down",
        tone: change > 0 ? "good" : "bad",
        headline: `Average booking ${change > 0 ? "up" : "down"} ${Math.abs(change)}% to £${Math.round(aNow).toLocaleString("en-GB")}`,
        detail: `vs £${Math.round(aPrev).toLocaleString("en-GB")} (${windowLabel}, ${bNow.length} vs ${bPrev.length} bookings).`,
      });
    }
  }

  // Bad news first, then good — the manager reads problems before wins.
  const toneRank: Record<TrendTone, number> = { bad: 0, good: 1, neutral: 2 };
  return trends.sort((a, b) => toneRank[a.tone] - toneRank[b.tone]);
}
