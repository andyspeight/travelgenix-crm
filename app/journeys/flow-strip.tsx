"use client";

/**
 * FlowStrip — a journey rule as a chain of steps in the app's existing pill
 * style, joined by chevrons:
 *
 *   [ A quote is awaiting a reply ] › [ Over £5,000 · unanswered 3+ days ] › [ Create task ]
 *
 * Per Andy's call: keep the chip look the journeys page already had, the
 * chevrons alone carry the "this flows into that" reading. Rendered on the
 * composer's review card and on every journey card (compact).
 */

import type { JourneyFlow } from "@/lib/journeys/engine";

const STEPS = ["when", "condition", "then"] as const;

export function FlowStrip({ flow, compact }: { flow: JourneyFlow; compact?: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        flexWrap: "wrap",
        gap: compact ? 4 : 5,
        rowGap: 6,
        margin: compact ? 0 : "2px 0 10px",
      }}
    >
      {STEPS.map((key, i) => (
        <span key={key} style={{ display: "inline-flex", alignItems: "center", gap: compact ? 4 : 5 }}>
          {i > 0 && (
            <span
              aria-hidden
              style={{
                color: "var(--tg-accent-dark)",
                fontSize: compact ? 12 : 14,
                fontWeight: 700,
                lineHeight: 1,
              }}
            >
              ›
            </span>
          )}
          <span
            style={{
              fontSize: compact ? 11 : 11.5,
              color: key === "then" ? "var(--tg-accent-dark)" : "var(--text-muted)",
              fontWeight: key === "then" ? 600 : 500,
              background: "var(--bg-subtle)",
              border: "1px solid var(--border)",
              borderRadius: 6,
              padding: compact ? "2px 7px" : "3px 9px",
              lineHeight: 1.5,
            }}
          >
            {flow[key]}
          </span>
        </span>
      ))}
    </div>
  );
}
