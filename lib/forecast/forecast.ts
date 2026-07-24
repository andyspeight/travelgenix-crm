/**
 * Forecasting — blueprint §7: "Forecasting must support both booking date
 * forecasting (when revenue is likely to be secured) and departure date
 * forecasting (when travel will take place)."
 *
 * Deterministic and openly weighted:
 *
 *   PIPELINE (booking-date view): open opportunities weighted by stage. The
 *   weights are printed next to the numbers — a forecast that hides its
 *   assumptions is a guess with a haircut. A live quote that the customer
 *   has VIEWED upgrades a quoted trip's weight (engagement is information).
 *
 *   TRAVEL CALENDAR (departure-date view): committed revenue by departure
 *   month (booked/pre-departure/travelling — won, not yet travelled), with
 *   the weighted open pipeline that has a departure date layered on top as
 *   "potential".
 *
 * Margin is deliberately absent until commission capture lands — better no
 * gross-profit column than an invented one. Pure functions, no I/O.
 */

export const STAGE_WEIGHTS = {
  enquiry: 0.2,
  quoted: 0.45,
  quoted_viewed: 0.6, // quoted + the customer has opened the live quote
} as const;

export type ForecastTrip = {
  id: string;
  stage: string;
  destination: string | null;
  total_value: number | null;
  depart_date: string | null;
};

export type ForecastQuote = {
  trip_id: string;
  status: string;
  view_count: number;
  total_price: number | null;
};

export type PipelineLine = {
  label: string;
  count: number;
  value: number; // face value
  weight: number; // 0-1
  weighted: number; // value × weight
};

export type MonthLine = {
  month: string; // "2026-08"
  label: string; // "Aug 2026"
  committed: number; // won revenue departing this month
  potential: number; // weighted open pipeline departing this month
  trips: number;
};

export type Forecast = {
  pipeline: {
    lines: PipelineLine[];
    totalFace: number;
    totalWeighted: number;
  };
  months: MonthLine[]; // next `monthsAhead` months, always present
};

const COMMITTED_STAGES = new Set(["booked", "pre_departure", "travelling"]);

const monthKey = (d: Date): string =>
  `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;

const monthLabel = (key: string): string => {
  const [y, m] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-GB", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
};

export function computeForecast(
  trips: ForecastTrip[],
  quotes: ForecastQuote[],
  now: Date = new Date(),
  monthsAhead: number = 6
): Forecast {
  // Trips whose live quote has been viewed get the engagement upgrade.
  const viewedTripIds = new Set(
    quotes
      .filter((q) => (q.status === "sent" || q.status === "viewed") && q.view_count > 0)
      .map((q) => q.trip_id)
  );

  // ─── Pipeline (booking-date view) ───────────────────────────────────
  const buckets: Record<"enquiry" | "quoted" | "quoted_viewed", { count: number; value: number }> = {
    enquiry: { count: 0, value: 0 },
    quoted: { count: 0, value: 0 },
    quoted_viewed: { count: 0, value: 0 },
  };

  const weightFor = (t: ForecastTrip): number | null => {
    if (t.stage === "enquiry") return STAGE_WEIGHTS.enquiry;
    if (t.stage === "quoted")
      return viewedTripIds.has(t.id) ? STAGE_WEIGHTS.quoted_viewed : STAGE_WEIGHTS.quoted;
    return null; // not open pipeline
  };

  for (const t of trips) {
    const v = t.total_value ?? 0;
    if (t.stage === "enquiry") {
      buckets.enquiry.count++;
      buckets.enquiry.value += v;
    } else if (t.stage === "quoted") {
      const b = viewedTripIds.has(t.id) ? buckets.quoted_viewed : buckets.quoted;
      b.count++;
      b.value += v;
    }
  }

  const lines: PipelineLine[] = [
    {
      label: "Enquiries",
      weight: STAGE_WEIGHTS.enquiry,
      count: buckets.enquiry.count,
      value: buckets.enquiry.value,
      weighted: buckets.enquiry.value * STAGE_WEIGHTS.enquiry,
    },
    {
      label: "Quoted",
      weight: STAGE_WEIGHTS.quoted,
      count: buckets.quoted.count,
      value: buckets.quoted.value,
      weighted: buckets.quoted.value * STAGE_WEIGHTS.quoted,
    },
    {
      label: "Quoted · quote viewed",
      weight: STAGE_WEIGHTS.quoted_viewed,
      count: buckets.quoted_viewed.count,
      value: buckets.quoted_viewed.value,
      weighted: buckets.quoted_viewed.value * STAGE_WEIGHTS.quoted_viewed,
    },
  ];

  const totalFace = lines.reduce((s, l) => s + l.value, 0);
  const totalWeighted = Math.round(lines.reduce((s, l) => s + l.weighted, 0));

  // ─── Travel calendar (departure-date view) ──────────────────────────
  const months: MonthLine[] = [];
  const base = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  for (let i = 0; i < monthsAhead; i++) {
    const key = monthKey(new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + i, 1)));
    months.push({ month: key, label: monthLabel(key), committed: 0, potential: 0, trips: 0 });
  }
  const byKey = new Map(months.map((m) => [m.month, m]));

  for (const t of trips) {
    if (!t.depart_date) continue;
    const key = monthKey(new Date(t.depart_date));
    const line = byKey.get(key);
    if (!line) continue;
    const v = t.total_value ?? 0;
    if (COMMITTED_STAGES.has(t.stage)) {
      line.committed += v;
      line.trips++;
    } else {
      const w = weightFor(t);
      if (w != null) {
        line.potential += v * w;
        line.trips++;
      }
    }
  }
  for (const m of months) {
    m.committed = Math.round(m.committed);
    m.potential = Math.round(m.potential);
  }

  return {
    pipeline: { lines, totalFace: Math.round(totalFace), totalWeighted },
    months,
  };
}
