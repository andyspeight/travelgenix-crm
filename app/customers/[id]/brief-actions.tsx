"use client";

/**
 * Customer 360 action buttons. Only "Refresh brief" is wired so far: it POSTs
 * to /api/customers/[id]/brief, which generates a fresh brief + scores, writes
 * them to Supabase, then we refresh the server component so the new brief and
 * prediction cards render. The other three are visual placeholders until their
 * features land (Draft a reply, Add note, Schedule call).
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function BriefActions({ householdId }: { householdId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const busy = loading || isPending;

  async function refresh() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/customers/${householdId}/brief`, {
        method: "POST",
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        throw new Error(data.error || `Failed (${res.status})`);
      }
      // Re-render the server component to pull the freshly cached brief + scores.
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't refresh the brief");
    } finally {
      setLoading(false);
    }
  }

  const baseBtn: React.CSSProperties = {
    background: "var(--bg-subtle)",
    border: "1px solid var(--border)",
    color: "var(--text-muted)",
    borderRadius: 6,
    padding: "5px 11px",
    fontSize: 12,
    fontWeight: 500,
    cursor: "pointer",
  };

  return (
    <div
      style={{
        display: "flex",
        gap: 6,
        marginTop: 14,
        paddingTop: 12,
        borderTop: "1px solid var(--border)",
        alignItems: "center",
        flexWrap: "wrap",
      }}
    >
      {["Draft a reply", "Add note", "Schedule call"].map((a) => (
        <button key={a} style={baseBtn} disabled>
          {a}
        </button>
      ))}
      <button
        onClick={refresh}
        disabled={busy}
        aria-busy={busy}
        style={{
          ...baseBtn,
          cursor: busy ? "wait" : "pointer",
          opacity: busy ? 0.7 : 1,
          color: "var(--tg-accent-dark)",
          borderColor: "var(--tg-accent)",
        }}
      >
        {busy ? "Refreshing…" : "Refresh brief"}
      </button>
      {error && (
        <span style={{ fontSize: 11.5, color: "var(--error)" }}>{error}</span>
      )}
    </div>
  );
}
