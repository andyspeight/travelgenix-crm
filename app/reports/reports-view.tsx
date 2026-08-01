"use client";

/**
 * Reports view. Owns the date-range toggle and renders four reports from the
 * trips passed in. All computation is client-side so switching range is
 * instant. Charts are lightweight CSS/SVG using the app's design tokens — no
 * charting library, so nothing fights the brand styling or bloats the bundle.
 *
 * All money figures are gross booking value (total_value).
 */

import { useMemo, useState } from "react";

export type ReportTrip = {
  id: string;
  householdId: string;
  stage: string;
  destination: string | null;
  country: string | null;
  value: number;
  source: string | null;
  date: string | null;
  departDate: string | null;
  returnDate: string | null;
  createdAt: string;
};

export type ReportHousehold = {
  id: string;
  customerSince: string | null;
  lifetimeValue: number;
  tripsCount: number;
};

type Range = "ytd" | "12m" | "all";

const RANGES: { key: Range; label: string }[] = [
  { key: "ytd", label: "This year" },
  { key: "12m", label: "Last 12 months" },
  { key: "all", label: "All time" },
];

// Booked-ish stages count as "won" revenue.
const BOOKED_STAGES = new Set(["booked", "pre_departure", "travelling", "returned"]);

const SOURCE_LABELS: Record<string, string> = {
  widget_enquiry: "Widget enquiry",
  phone: "Phone",
  walk_in: "Walk-in",
  referral: "Referral",
  website: "Website",
};

const STAGE_ORDER = ["enquiry", "quoted", "booked", "pre_departure", "travelling", "returned"];
const STAGE_LABELS: Record<string, string> = {
  enquiry: "Enquiry",
  quoted: "Quoted",
  booked: "Booked",
  pre_departure: "Pre-departure",
  travelling: "Travelling",
  returned: "Returned",
};

function money(n: number): string {
  if (n >= 1000) return `£${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  return `£${Math.round(n).toLocaleString("en-GB")}`;
}

export function ReportsView({
  trips,
  households,
}: {
  trips: ReportTrip[];
  households: ReportHousehold[];
}) {
  const [range, setRange] = useState<Range>("12m");

  const filtered = useMemo(() => {
    if (range === "all") return trips;
    const now = new Date();
    const cutoff =
      range === "ytd"
        ? new Date(now.getFullYear(), 0, 1)
        : new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
    return trips.filter((t) => {
      if (!t.date) return false;
      return new Date(t.date) >= cutoff;
    });
  }, [trips, range]);

  return (
    <div style={{ padding: "20px 28px 40px", maxWidth: 1200, margin: "0 auto", width: "100%" }}>
      {/* Range toggle */}
      <div style={{ display: "flex", gap: 4, marginBottom: 20 }}>
        {RANGES.map((r) => (
          <button
            key={r.key}
            onClick={() => setRange(r.key)}
            style={{
              background: range === r.key ? "var(--tg-primary)" : "var(--surface)",
              color: range === r.key ? "white" : "var(--text-muted)",
              border: `1px solid ${range === r.key ? "var(--tg-primary)" : "var(--border)"}`,
              borderRadius: 7,
              padding: "6px 13px",
              fontSize: 12.5,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            {r.label}
          </button>
        ))}
        <span style={{ marginLeft: "auto", alignSelf: "center", fontSize: 12.5, color: "var(--text-subtle)" }}>
          {filtered.length} {filtered.length === 1 ? "trip" : "trips"} in range
        </span>
      </div>

      {/* Headline tiles */}
      <Headlines trips={filtered} />

      {/* Two-column report grid */}
      <div className="rgrid rgrid-2" style={{ gap: 16, marginTop: 16 }}>
        <PipelineByStage trips={filtered} />
        <ConversionFunnel trips={filtered} />
        <RevenueByDestination trips={filtered} />
        <SourceAttribution trips={filtered} />
      </div>

      {/* Business health section */}
      <div style={{ marginTop: 28, marginBottom: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", letterSpacing: "-0.01em" }}>
          Business health
        </div>
        <div style={{ fontSize: 12, color: "var(--text-subtle)", marginTop: 2 }}>
          Growth, customer mix and booking behaviour
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <RevenueTrend trips={filtered} />
      </div>

      <div className="rgrid rgrid-2" style={{ gap: 16 }}>
        <NewVsRepeat trips={filtered} households={households} />
        <CustomerValueBands households={households} />
        <DestinationTable trips={filtered} />
        <LeadTime trips={filtered} />
      </div>
    </div>
  );
}

// ─── Headline tiles ─────────────────────────────────────────────────────────
function Headlines({ trips }: { trips: ReportTrip[] }) {
  const booked = trips.filter((t) => BOOKED_STAGES.has(t.stage));
  const wonValue = booked.reduce((s, t) => s + t.value, 0);
  const pipelineValue = trips
    .filter((t) => t.stage === "enquiry" || t.stage === "quoted")
    .reduce((s, t) => s + t.value, 0);
  const avgBooking = booked.length ? wonValue / booked.length : 0;

  const tiles = [
    { label: "Booked turnover", value: money(wonValue) },
    { label: "Open pipeline", value: money(pipelineValue) },
    { label: "Bookings", value: String(booked.length) },
    { label: "Avg booking", value: money(avgBooking) },
  ];

  return (
    <div className="rgrid rgrid-4" style={{ gap: 16 }}>
      {tiles.map((t) => (
        <div
          key={t.label}
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            padding: 16,
          }}
        >
          <div
            style={{
              fontSize: 10.5, fontWeight: 600, color: "var(--text-subtle)",
              letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: 6,
            }}
          >
            {t.label}
          </div>
          <div style={{ fontSize: 24, fontWeight: 700, color: "var(--text)", letterSpacing: "-0.01em" }}>
            {t.value}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Report card shell ──────────────────────────────────────────────────────
function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        padding: 18,
      }}
    >
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>{title}</div>
        {subtitle && (
          <div style={{ fontSize: 12, color: "var(--text-subtle)", marginTop: 2 }}>{subtitle}</div>
        )}
      </div>
      {children}
    </div>
  );
}

function EmptyNote() {
  return (
    <div style={{ fontSize: 12.5, color: "var(--text-subtle)", padding: "20px 0", textAlign: "center" }}>
      No data in this range.
    </div>
  );
}

// ─── 1. Pipeline by stage ───────────────────────────────────────────────────
function PipelineByStage({ trips }: { trips: ReportTrip[] }) {
  const byStage = STAGE_ORDER.map((stage) => {
    const items = trips.filter((t) => t.stage === stage);
    return {
      stage,
      label: STAGE_LABELS[stage],
      count: items.length,
      value: items.reduce((s, t) => s + t.value, 0),
    };
  });
  const maxValue = Math.max(...byStage.map((s) => s.value), 1);
  const hasData = byStage.some((s) => s.count > 0);

  return (
    <Card title="Pipeline by stage" subtitle="Count and total value at each stage">
      {!hasData ? (
        <EmptyNote />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {byStage.map((s) => (
            <div key={s.stage}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
                <span style={{ color: "var(--text-muted)", fontWeight: 500 }}>
                  {s.label} <span style={{ color: "var(--text-subtle)" }}>· {s.count}</span>
                </span>
                <span style={{ color: "var(--text)", fontWeight: 600 }}>{money(s.value)}</span>
              </div>
              <div style={{ height: 8, borderRadius: 999, background: "var(--bg-subtle)", overflow: "hidden" }}>
                <div
                  style={{
                    width: `${(s.value / maxValue) * 100}%`,
                    height: "100%",
                    borderRadius: 999,
                    background: "var(--tg-accent)",
                    minWidth: s.value > 0 ? 4 : 0,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// ─── 2. Conversion funnel ───────────────────────────────────────────────────
function ConversionFunnel({ trips }: { trips: ReportTrip[] }) {
  // Funnel counts trips that reached AT LEAST each stage.
  const reachedQuoted = trips.filter((t) => ["quoted", "booked", "pre_departure", "travelling", "returned"].includes(t.stage)).length;
  const reachedBooked = trips.filter((t) => BOOKED_STAGES.has(t.stage)).length;
  const total = trips.filter((t) => t.stage !== "cancelled").length;

  const steps = [
    { label: "Enquiries", count: total },
    { label: "Quoted", count: reachedQuoted },
    { label: "Booked", count: reachedBooked },
  ];
  const max = Math.max(total, 1);
  const enquiryToBooked = total ? Math.round((reachedBooked / total) * 100) : 0;

  return (
    <Card title="Conversion funnel" subtitle={`${enquiryToBooked}% of enquiries convert to bookings`}>
      {total === 0 ? (
        <EmptyNote />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {steps.map((s, i) => {
            const pct = (s.count / max) * 100;
            const dropFromPrev =
              i > 0 && steps[i - 1].count > 0
                ? Math.round((s.count / steps[i - 1].count) * 100)
                : null;
            return (
              <div key={s.label}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
                  <span style={{ color: "var(--text-muted)", fontWeight: 500 }}>{s.label}</span>
                  <span style={{ color: "var(--text)", fontWeight: 600 }}>
                    {s.count}
                    {dropFromPrev != null && (
                      <span style={{ color: "var(--text-subtle)", fontWeight: 400, marginLeft: 6 }}>
                        {dropFromPrev}%
                      </span>
                    )}
                  </span>
                </div>
                <div style={{ height: 20, borderRadius: 6, background: "var(--bg-subtle)", overflow: "hidden" }}>
                  <div
                    style={{
                      width: `${pct}%`,
                      height: "100%",
                      borderRadius: 6,
                      background: `color-mix(in srgb, var(--tg-primary) ${100 - i * 22}%, var(--tg-accent))`,
                      minWidth: s.count > 0 ? 6 : 0,
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

// ─── 3. Revenue by destination ──────────────────────────────────────────────
function RevenueByDestination({ trips }: { trips: ReportTrip[] }) {
  // Booked revenue grouped by destination, top 6.
  const booked = trips.filter((t) => BOOKED_STAGES.has(t.stage));
  const map = new Map<string, number>();
  for (const t of booked) {
    const key = t.destination || t.country || "Unknown";
    map.set(key, (map.get(key) ?? 0) + t.value);
  }
  const ranked = [...map.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);
  const max = Math.max(...ranked.map((r) => r.value), 1);

  return (
    <Card title="Turnover by destination" subtitle="What customers paid, top destinations">
      {ranked.length === 0 ? (
        <EmptyNote />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {ranked.map((r) => (
            <div key={r.name}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
                <span style={{ color: "var(--text-muted)", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 180 }}>
                  {r.name}
                </span>
                <span style={{ color: "var(--text)", fontWeight: 600 }}>{money(r.value)}</span>
              </div>
              <div style={{ height: 8, borderRadius: 999, background: "var(--bg-subtle)", overflow: "hidden" }}>
                <div style={{ width: `${(r.value / max) * 100}%`, height: "100%", borderRadius: 999, background: "var(--success)", minWidth: 4 }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// ─── 4. Source attribution ──────────────────────────────────────────────────
function SourceAttribution({ trips }: { trips: ReportTrip[] }) {
  // Where do bookings come from? Count + value by source.
  const booked = trips.filter((t) => BOOKED_STAGES.has(t.stage));
  const map = new Map<string, { count: number; value: number }>();
  for (const t of booked) {
    const key = t.source || "unknown";
    const cur = map.get(key) ?? { count: 0, value: 0 };
    cur.count += 1;
    cur.value += t.value;
    map.set(key, cur);
  }
  const ranked = [...map.entries()]
    .map(([source, d]) => ({ source, ...d }))
    .sort((a, b) => b.value - a.value);
  const totalValue = ranked.reduce((s, r) => s + r.value, 0) || 1;

  return (
    <Card title="Source attribution" subtitle="Where booked turnover comes from">
      {ranked.length === 0 ? (
        <EmptyNote />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {ranked.map((r) => {
            const share = Math.round((r.value / totalValue) * 100);
            return (
              <div key={r.source} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 500, width: 110, flexShrink: 0 }}>
                  {SOURCE_LABELS[r.source] ?? r.source}
                </span>
                <div style={{ flex: 1, height: 8, borderRadius: 999, background: "var(--bg-subtle)", overflow: "hidden" }}>
                  <div style={{ width: `${share}%`, height: "100%", borderRadius: 999, background: "var(--info)", minWidth: 4 }} />
                </div>
                <span style={{ fontSize: 12, color: "var(--text)", fontWeight: 600, width: 70, textAlign: "right", flexShrink: 0 }}>
                  {money(r.value)}
                </span>
                <span style={{ fontSize: 11, color: "var(--text-subtle)", width: 32, textAlign: "right", flexShrink: 0 }}>
                  {share}%
                </span>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

// ─── 5. Revenue trend (booked value by month) ───────────────────────────────
function RevenueTrend({ trips }: { trips: ReportTrip[] }) {
  // Group booked value by month using the trip's effective date.
  const booked = trips.filter((t) => BOOKED_STAGES.has(t.stage) && t.date);
  const byMonth = new Map<string, number>();
  for (const t of booked) {
    const d = new Date(t.date!);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    byMonth.set(key, (byMonth.get(key) ?? 0) + t.value);
  }
  const months = [...byMonth.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const max = Math.max(...months.map((m) => m[1]), 1);

  const fmtMonth = (key: string) => {
    const [y, m] = key.split("-");
    return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("en-GB", {
      month: "short",
      year: "2-digit",
    });
  };

  return (
    <Card title="Turnover trend" subtitle="What customers paid, by month">
      {months.length === 0 ? (
        <EmptyNote />
      ) : (
        <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 160, paddingTop: 8 }}>
          {months.map(([key, value]) => (
            <div key={key} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6, minWidth: 0 }}>
              <div style={{ fontSize: 9.5, color: "var(--text-subtle)", fontWeight: 600, whiteSpace: "nowrap" }}>
                {value >= 1000 ? `${Math.round(value / 1000)}k` : Math.round(value)}
              </div>
              <div
                title={`${fmtMonth(key)}: ${money(value)}`}
                style={{
                  width: "100%",
                  maxWidth: 40,
                  height: `${Math.max((value / max) * 120, 3)}px`,
                  background: "var(--tg-accent)",
                  borderRadius: "4px 4px 0 0",
                }}
              />
              <div style={{ fontSize: 9.5, color: "var(--text-subtle)", whiteSpace: "nowrap", transform: "rotate(-45deg)", transformOrigin: "center", marginTop: 4 }}>
                {fmtMonth(key)}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// ─── 6. New vs repeat customers ──────────────────────────────────────────────
function NewVsRepeat({ trips, households }: { trips: ReportTrip[]; households: ReportHousehold[] }) {
  // A household is "repeat" if it has more than one trip overall; "new" if one.
  // Attribute booked revenue in range to whichever bucket the household is in.
  const repeatIds = new Set(households.filter((h) => h.tripsCount > 1).map((h) => h.id));
  const booked = trips.filter((t) => BOOKED_STAGES.has(t.stage));

  let newRev = 0;
  let repeatRev = 0;
  let newCount = 0;
  let repeatCount = 0;
  for (const t of booked) {
    if (repeatIds.has(t.householdId)) {
      repeatRev += t.value;
      repeatCount += 1;
    } else {
      newRev += t.value;
      newCount += 1;
    }
  }
  const total = newRev + repeatRev || 1;
  const repeatShare = Math.round((repeatRev / total) * 100);

  const rows = [
    { label: "Repeat customers", value: repeatRev, count: repeatCount, color: "var(--success)" },
    { label: "New customers", value: newRev, count: newCount, color: "var(--info)" },
  ];

  return (
    <Card title="New vs repeat" subtitle={`${repeatShare}% of booked revenue from repeat customers`}>
      {booked.length === 0 ? (
        <EmptyNote />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 4 }}>
          {/* stacked bar */}
          <div style={{ display: "flex", height: 14, borderRadius: 999, overflow: "hidden", background: "var(--bg-subtle)" }}>
            {rows.map((r) => (
              <div key={r.label} style={{ width: `${(r.value / total) * 100}%`, background: r.color }} title={`${r.label}: ${money(r.value)}`} />
            ))}
          </div>
          {rows.map((r) => (
            <div key={r.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12.5 }}>
              <span style={{ display: "flex", alignItems: "center", gap: 7, color: "var(--text-muted)", fontWeight: 500 }}>
                <span style={{ width: 9, height: 9, borderRadius: 3, background: r.color }} />
                {r.label} <span style={{ color: "var(--text-subtle)" }}>· {r.count}</span>
              </span>
              <span style={{ color: "var(--text)", fontWeight: 600 }}>{money(r.value)}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// ─── 7. Customer value distribution ──────────────────────────────────────────
function CustomerValueBands({ households }: { households: ReportHousehold[] }) {
  // Band households by lifetime value. Not range-filtered: LTV is cumulative.
  const bands = [
    { label: "Under £5k", min: 0, max: 5000 },
    { label: "£5k – £15k", min: 5000, max: 15000 },
    { label: "£15k – £30k", min: 15000, max: 30000 },
    { label: "£30k+", min: 30000, max: Infinity },
  ].map((b) => {
    const inBand = households.filter((h) => h.lifetimeValue >= b.min && h.lifetimeValue < b.max);
    return {
      label: b.label,
      count: inBand.length,
      value: inBand.reduce((s, h) => s + h.lifetimeValue, 0),
    };
  });
  const maxCount = Math.max(...bands.map((b) => b.count), 1);
  const hasData = households.length > 0;

  return (
    <Card title="Customer value" subtitle="Households by lifetime value (all time)">
      {!hasData ? (
        <EmptyNote />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {bands.map((b) => (
            <div key={b.label}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
                <span style={{ color: "var(--text-muted)", fontWeight: 500 }}>{b.label}</span>
                <span style={{ color: "var(--text)", fontWeight: 600 }}>
                  {b.count} <span style={{ color: "var(--text-subtle)", fontWeight: 400 }}>· {money(b.value)}</span>
                </span>
              </div>
              <div style={{ height: 8, borderRadius: 999, background: "var(--bg-subtle)", overflow: "hidden" }}>
                <div style={{ width: `${(b.count / maxCount) * 100}%`, height: "100%", borderRadius: 999, background: "var(--tg-primary)", minWidth: b.count > 0 ? 4 : 0 }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// ─── 8. Destination detail table (volume, value, avg) ────────────────────────
function DestinationTable({ trips }: { trips: ReportTrip[] }) {
  const booked = trips.filter((t) => BOOKED_STAGES.has(t.stage));
  const map = new Map<string, { count: number; value: number }>();
  for (const t of booked) {
    const key = t.country || t.destination || "Unknown";
    const cur = map.get(key) ?? { count: 0, value: 0 };
    cur.count += 1;
    cur.value += t.value;
    map.set(key, cur);
  }
  const ranked = [...map.entries()]
    .map(([name, d]) => ({ name, ...d, avg: d.value / d.count }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 7);

  const th: React.CSSProperties = { fontSize: 10.5, fontWeight: 600, color: "var(--text-subtle)", letterSpacing: "0.04em", textTransform: "uppercase", textAlign: "right", padding: "4px 0" };
  const td: React.CSSProperties = { fontSize: 12.5, color: "var(--text)", textAlign: "right", padding: "6px 0", borderTop: "1px solid var(--border)" };

  return (
    <Card title="Destination detail" subtitle="Volume, total and average booked value">
      {ranked.length === 0 ? (
        <EmptyNote />
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ ...th, textAlign: "left" }}>Country</th>
              <th style={th}>Trips</th>
              <th style={th}>Total</th>
              <th style={th}>Avg</th>
            </tr>
          </thead>
          <tbody>
            {ranked.map((r) => (
              <tr key={r.name}>
                <td style={{ ...td, textAlign: "left", color: "var(--text-muted)", fontWeight: 500 }}>{r.name}</td>
                <td style={td}>{r.count}</td>
                <td style={{ ...td, fontWeight: 600 }}>{money(r.value)}</td>
                <td style={{ ...td, color: "var(--text-muted)" }}>{money(r.avg)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}

// ─── 9. Average lead time ────────────────────────────────────────────────────
function LeadTime({ trips }: { trips: ReportTrip[] }) {
  // Days between booking (created_at) and departure, for booked trips with both.
  const withLead = trips
    .filter((t) => BOOKED_STAGES.has(t.stage) && t.departDate && t.createdAt)
    .map((t) => {
      const dep = new Date(t.departDate!).getTime();
      const created = new Date(t.createdAt).getTime();
      return Math.round((dep - created) / (1000 * 60 * 60 * 24));
    })
    .filter((d) => d >= 0);

  if (withLead.length === 0) {
    return (
      <Card title="Booking lead time" subtitle="How far ahead customers book">
        <EmptyNote />
      </Card>
    );
  }

  const avg = Math.round(withLead.reduce((s, d) => s + d, 0) / withLead.length);
  const sorted = [...withLead].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];

  // Distribution buckets.
  const buckets = [
    { label: "Under 1 month", test: (d: number) => d < 30 },
    { label: "1 – 3 months", test: (d: number) => d >= 30 && d < 90 },
    { label: "3 – 6 months", test: (d: number) => d >= 90 && d < 180 },
    { label: "6 months+", test: (d: number) => d >= 180 },
  ].map((b) => ({ label: b.label, count: withLead.filter(b.test).length }));
  const maxCount = Math.max(...buckets.map((b) => b.count), 1);

  return (
    <Card title="Booking lead time" subtitle={`Average ${avg} days · median ${median} days ahead`}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {buckets.map((b) => (
          <div key={b.label}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
              <span style={{ color: "var(--text-muted)", fontWeight: 500 }}>{b.label}</span>
              <span style={{ color: "var(--text)", fontWeight: 600 }}>{b.count}</span>
            </div>
            <div style={{ height: 8, borderRadius: 999, background: "var(--bg-subtle)", overflow: "hidden" }}>
              <div style={{ width: `${(b.count / maxCount) * 100}%`, height: "100%", borderRadius: 999, background: "var(--warning)", minWidth: b.count > 0 ? 4 : 0 }} />
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
