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
  stage: string;
  destination: string | null;
  country: string | null;
  value: number;
  source: string | null;
  date: string | null;
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

export function ReportsView({ trips }: { trips: ReportTrip[] }) {
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
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 16,
          marginTop: 16,
        }}
      >
        <PipelineByStage trips={filtered} />
        <ConversionFunnel trips={filtered} />
        <RevenueByDestination trips={filtered} />
        <SourceAttribution trips={filtered} />
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
    { label: "Booked revenue", value: money(wonValue) },
    { label: "Open pipeline", value: money(pipelineValue) },
    { label: "Bookings", value: String(booked.length) },
    { label: "Avg booking", value: money(avgBooking) },
  ];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
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
    <Card title="Revenue by destination" subtitle="Booked value, top destinations">
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
    <Card title="Source attribution" subtitle="Where booked revenue comes from">
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
