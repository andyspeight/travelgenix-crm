/**
 * Luna's insight panels at the top of /reports — Server Components, computed
 * from rows the page already loads plus enquiries and quotes:
 *
 *   TRENDS   — deterministic period-over-period deltas (lib/trends/detect):
 *              what's rising, what's slipping, with both numbers shown.
 *              Hidden entirely when the data can't honestly support a trend.
 *
 *   FORECAST — blueprint §7's two views (lib/forecast/forecast): the stage-
 *              weighted pipeline (weights printed, never hidden) and the
 *              travel calendar of committed vs potential revenue by
 *              departure month.
 */

import type { Trend } from "@/lib/trends/detect";
import type { Forecast } from "@/lib/forecast/forecast";

const money = (n: number): string =>
  n >= 10000 ? `£${Math.round(n / 1000)}k` : `£${Math.round(n).toLocaleString("en-GB")}`;

const TONE_COLOUR: Record<Trend["tone"], string> = {
  bad: "#dc2626",
  good: "#059669",
  neutral: "var(--tg-accent-dark)",
};

export function InsightPanels({ trends, forecast }: { trends: Trend[]; forecast: Forecast }) {
  const hasPipeline = forecast.pipeline.totalFace > 0;
  const hasCalendar = forecast.months.some((m) => m.committed > 0 || m.potential > 0);
  if (trends.length === 0 && !hasPipeline && !hasCalendar) return null;

  const maxMonth = Math.max(
    1,
    ...forecast.months.map((m) => m.committed + m.potential)
  );

  return (
    <div style={{ padding: "20px 28px 0", maxWidth: 1200, margin: "0 auto", width: "100%" }}>
      <div className="rgrid rgrid-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
        {/* ─── Trends ─── */}
        {trends.length > 0 && (
          <section
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 14,
              padding: 18,
              boxShadow: "var(--shadow-sm)",
              gridColumn: hasPipeline || hasCalendar ? undefined : "1 / -1",
            }}
          >
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 12 }}>
              <span style={{ fontSize: 13.5, fontWeight: 700, color: "var(--text)" }}>
                Luna · What&apos;s changing
              </span>
              <span style={{ fontSize: 10.5, color: "var(--text-subtle)" }}>
                measured, never guessed
              </span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {trends.slice(0, 5).map((t, i) => (
                <div key={`${t.kind}-${i}`} style={{ display: "flex", gap: 10 }}>
                  <span
                    aria-hidden
                    style={{
                      color: TONE_COLOUR[t.tone],
                      fontWeight: 800,
                      fontSize: 13,
                      lineHeight: 1.4,
                    }}
                  >
                    {t.direction === "up" ? "▲" : "▼"}
                  </span>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>
                      {t.headline}
                    </div>
                    <div style={{ fontSize: 11.5, color: "var(--text-muted)", lineHeight: 1.5 }}>
                      {t.detail}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ─── Forecast ─── */}
        {(hasPipeline || hasCalendar) && (
          <section
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 14,
              padding: 18,
              boxShadow: "var(--shadow-sm)",
              gridColumn: trends.length > 0 ? undefined : "1 / -1",
            }}
          >
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 12 }}>
              <span style={{ fontSize: 13.5, fontWeight: 700, color: "var(--text)" }}>
                Forecast
              </span>
              <span style={{ fontSize: 10.5, color: "var(--text-subtle)" }}>
                weights shown — a forecast that hides its assumptions is a guess
              </span>
            </div>

            {hasPipeline && (
              <div style={{ marginBottom: 14 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "baseline",
                    gap: 8,
                    marginBottom: 6,
                  }}
                >
                  <span style={{ fontSize: 19, fontWeight: 800, color: "var(--text)" }}>
                    {money(forecast.pipeline.totalWeighted)}
                  </span>
                  <span style={{ fontSize: 11.5, color: "var(--text-muted)" }}>
                    expected from {money(forecast.pipeline.totalFace)} of open pipeline
                  </span>
                </div>
                {forecast.pipeline.lines
                  .filter((l) => l.count > 0)
                  .map((l) => (
                    <div
                      key={l.label}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        fontSize: 11.5,
                        color: "var(--text-muted)",
                        padding: "2px 0",
                      }}
                    >
                      <span>
                        {l.label} · {l.count} × {Math.round(l.weight * 100)}%
                      </span>
                      <span style={{ fontWeight: 600, color: "var(--text)" }}>
                        {money(Math.round(l.weighted))}
                      </span>
                    </div>
                  ))}
              </div>
            )}

            {hasCalendar && (
              <div>
                <div
                  style={{
                    fontSize: 10.5,
                    fontWeight: 700,
                    color: "var(--text-subtle)",
                    letterSpacing: "0.05em",
                    textTransform: "uppercase",
                    marginBottom: 6,
                  }}
                >
                  Departures — committed / potential
                </div>
                {forecast.months.map((m) => (
                  <div key={m.month} style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 0" }}>
                    <span style={{ fontSize: 11.5, color: "var(--text-muted)", width: 64, flexShrink: 0 }}>
                      {m.label}
                    </span>
                    <div style={{ flex: 1, display: "flex", height: 10, borderRadius: 5, overflow: "hidden", background: "var(--bg-subtle)" }}>
                      <div
                        style={{
                          width: `${(m.committed / maxMonth) * 100}%`,
                          background: "var(--tg-primary)",
                        }}
                        title={`Committed ${money(m.committed)}`}
                      />
                      <div
                        style={{
                          width: `${(m.potential / maxMonth) * 100}%`,
                          background: "var(--tg-accent)",
                          opacity: 0.55,
                        }}
                        title={`Potential ${money(m.potential)} (weighted pipeline)`}
                      />
                    </div>
                    <span style={{ fontSize: 11, color: "var(--text)", fontWeight: 600, width: 88, textAlign: "right", flexShrink: 0 }}>
                      {money(m.committed)}
                      {m.potential > 0 && (
                        <span style={{ color: "var(--text-subtle)", fontWeight: 500 }}>
                          {" "}+{money(m.potential)}
                        </span>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
