"use client";

/**
 * Luna · Next steps — interactive panel. Steps are computed server-side from
 * real data (see lib/customer/next-steps.ts); this component renders them and
 * wires each "Do" button to its action:
 *   - reply  -> deep-link the inbox to that message
 *   - task   -> POST a follow-up task, then refresh so it shows in /tasks
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SparklesIcon } from "@/components/ui/icons";
import type { NextStep } from "@/lib/customer/next-steps";

export function NextSteps({
  householdId,
  steps,
}: {
  householdId: string;
  steps: NextStep[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [busyIdx, setBusyIdx] = useState<number | null>(null);
  const [doneIdx, setDoneIdx] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);

  async function doStep(step: NextStep, idx: number) {
    setError(null);
    if (step.kind === "reply") {
      router.push(`/inbox?id=${step.interactionId}&lane=all`);
      return;
    }
    if (step.kind !== "task") return;

    setBusyIdx(idx);
    try {
      const res = await fetch(`/api/customers/${householdId}/task`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: step.taskKind, title: step.title, reason: step.reason, trip_id: step.tripId ?? null }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error || `Failed (${res.status})`);
      setDoneIdx((prev) => new Set(prev).add(idx));
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create the task");
    } finally {
      setBusyIdx(null);
    }
  }

  return (
    <div
      style={{
        background: "linear-gradient(135deg, var(--tg-primary-dark) 0%, #0E1837 100%)",
        borderRadius: 12,
        padding: 18,
        color: "white",
        marginBottom: 16,
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: "-30%",
          right: "-10%",
          width: 200,
          height: 200,
          background: "radial-gradient(circle, var(--tg-accent) 0%, transparent 70%)",
          opacity: 0.15,
          pointerEvents: "none",
        }}
      />
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, position: "relative" }}>
        <SparklesIcon width={14} height={14} />
        <span
          style={{
            fontSize: 10.5,
            fontWeight: 600,
            color: "var(--tg-accent-light)",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          Luna · Next steps
        </span>
      </div>

      <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 10, position: "relative" }}>
        {steps.map((s, idx) => {
          const done = doneIdx.has(idx);
          const busy = busyIdx === idx || (isPending && busyIdx === idx);
          return (
            <li
              key={idx}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 10,
                fontSize: 13,
                lineHeight: 1.45,
                color: "rgba(255, 255, 255, 0.9)",
                opacity: done ? 0.55 : 1,
              }}
            >
              <span
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 6,
                  background: "rgba(72, 202, 228, 0.15)",
                  color: "var(--tg-accent-light)",
                  fontSize: 11,
                  fontWeight: 700,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  border: "1px solid rgba(72, 202, 228, 0.3)",
                }}
              >
                {s.kind === "info" ? "✓" : idx + 1}
              </span>
              <span style={{ flex: 1, textDecoration: done ? "line-through" : "none" }}>{s.text}</span>
              {s.kind !== "info" && (
                <button
                  onClick={() => doStep(s, idx)}
                  disabled={busy || done}
                  aria-busy={busy}
                  style={{
                    background: "rgba(255, 255, 255, 0.1)",
                    border: "1px solid rgba(255, 255, 255, 0.15)",
                    color: "white",
                    borderRadius: 6,
                    padding: "3px 9px",
                    fontSize: 11,
                    fontWeight: 500,
                    cursor: busy || done ? "default" : "pointer",
                    flexShrink: 0,
                    opacity: busy ? 0.7 : 1,
                  }}
                >
                  {done ? "Done" : busy ? "…" : s.kind === "reply" ? "Reply" : "Do"}
                </button>
              )}
            </li>
          );
        })}
      </ol>

      {error && (
        <p style={{ fontSize: 11.5, color: "#FCA5A5", marginTop: 10, marginBottom: 0, position: "relative" }}>{error}</p>
      )}
    </div>
  );
}
