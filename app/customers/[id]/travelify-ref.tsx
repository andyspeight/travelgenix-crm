"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * The Travelify booking reference on a trip: the one thing the CRM stores so
 * the customer portal can show the live account (payments, balance,
 * documents) from Travelify, the source of truth. Inline on the trip card:
 * read as a mono chip, click to edit, PATCH /api/trips/[id].
 */
export function TravelifyRefField({ tripId, value }: { tripId: string; value: string | null }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/trips/${tripId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ travelify_order_ref: draft.trim() || null }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error || "Couldn't save the reference.");
        return;
      }
      setEditing(false);
      router.refresh();
    } catch {
      setError("Couldn't reach the server.");
    } finally {
      setBusy(false);
    }
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => {
          setDraft(value ?? "");
          setEditing(true);
        }}
        title="Travelify booking reference. The customer portal shows payments, balance and documents from this booking."
        style={{
          background: "none",
          border: "1px dashed var(--border-strong)",
          borderRadius: 6,
          padding: "1px 7px",
          fontSize: 10.5,
          fontFamily: value ? '"JetBrains Mono", monospace' : "inherit",
          color: value ? "var(--text)" : "var(--text-subtle)",
          cursor: "pointer",
          lineHeight: 1.6,
        }}
      >
        {value ? `Travelify ${value}` : "Link Travelify booking"}
      </button>
    );
  }

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value.toUpperCase())}
        onKeyDown={(e) => {
          if (e.key === "Enter") void save();
          if (e.key === "Escape") setEditing(false);
        }}
        placeholder="Travelify ref"
        aria-label="Travelify booking reference"
        maxLength={40}
        style={{
          width: 130,
          height: 24,
          padding: "0 7px",
          fontSize: 11.5,
          fontFamily: '"JetBrains Mono", monospace',
          border: "1px solid var(--border-strong)",
          borderRadius: 6,
          background: "var(--surface)",
          color: "var(--text)",
        }}
      />
      <button
        type="button"
        onClick={() => void save()}
        disabled={busy}
        style={{
          height: 24,
          padding: "0 9px",
          fontSize: 11,
          fontWeight: 600,
          border: "none",
          borderRadius: 6,
          background: "var(--tg-primary)",
          color: "#fff",
          cursor: busy ? "default" : "pointer",
          opacity: busy ? 0.6 : 1,
        }}
      >
        {busy ? "Saving" : "Save"}
      </button>
      <button
        type="button"
        onClick={() => setEditing(false)}
        disabled={busy}
        style={{
          height: 24,
          padding: "0 7px",
          fontSize: 11,
          border: "1px solid var(--border)",
          borderRadius: 6,
          background: "transparent",
          color: "var(--text-muted)",
          cursor: "pointer",
        }}
      >
        Cancel
      </button>
      {error ? (
        <span role="alert" style={{ fontSize: 11, color: "var(--error)" }}>
          {error}
        </span>
      ) : null}
    </span>
  );
}
