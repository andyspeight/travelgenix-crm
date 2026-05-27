"use client";

/**
 * Editable Preferences panel. Agents add, edit and remove a household's travel
 * preferences here. Each change calls /api/customers/[id]/preferences and
 * updates optimistically, rolling back on failure. Preferences feed the AI
 * brief and Trip Match, so this is also how Luna gets smarter over time.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";

type Pref = { id: string; category: string; value: string };

const CATEGORIES = [
  { key: "style", label: "Style" },
  { key: "airline", label: "Airline" },
  { key: "seat", label: "Seat" },
  { key: "room", label: "Room" },
  { key: "dietary", label: "Dietary" },
  { key: "budget", label: "Budget" },
  { key: "avoid", label: "Avoid" },
  { key: "other", label: "Other" },
];

const labelFor = (cat: string) =>
  CATEGORIES.find((c) => c.key === cat)?.label ?? cat;

export function PreferencesPanelEditable({
  householdId,
  initial,
}: {
  householdId: string;
  initial: Pref[];
}) {
  const router = useRouter();
  const [prefs, setPrefs] = useState<Pref[]>(initial);
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newCat, setNewCat] = useState("style");
  const [newVal, setNewVal] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const base = `/api/customers/${householdId}/preferences`;

  async function add() {
    const value = newVal.trim();
    if (!value) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(base, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: newCat, value }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.error || "Failed to add");
      setPrefs((p) => [...p, data.preference]);
      setNewVal("");
      setAdding(false);
      router.refresh(); // so the brief/match can pick up the new signal
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add");
    } finally {
      setBusy(false);
    }
  }

  async function remove(prefId: string) {
    const prev = prefs;
    setPrefs((p) => p.filter((x) => x.id !== prefId)); // optimistic
    try {
      const res = await fetch(base, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prefId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.error || "Failed to remove");
      router.refresh();
    } catch (e) {
      setPrefs(prev); // rollback
      setError(e instanceof Error ? e.message : "Failed to remove");
    }
  }

  async function saveEdit(prefId: string, value: string) {
    const trimmed = value.trim();
    if (!trimmed) return;
    const prev = prefs;
    setPrefs((p) => p.map((x) => (x.id === prefId ? { ...x, value: trimmed } : x)));
    try {
      const res = await fetch(base, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prefId, value: trimmed }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.error || "Failed to update");
    } catch (e) {
      setPrefs(prev);
      setError(e instanceof Error ? e.message : "Failed to update");
    }
  }

  const rowStyle: React.CSSProperties = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "6px 0",
    gap: 12,
    borderBottom: "1px solid var(--border)",
  };

  const inputStyle: React.CSSProperties = {
    fontSize: 12,
    padding: "4px 7px",
    border: "1px solid var(--border)",
    borderRadius: 5,
    background: "var(--surface)",
    color: "var(--text)",
    width: "100%",
  };

  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        marginBottom: 16,
      }}
    >
      {/* header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "12px 16px",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>
          Preferences
        </span>
        <button
          onClick={() => setEditing((v) => !v)}
          style={{
            background: "none",
            border: "none",
            color: "var(--tg-accent-dark)",
            fontSize: 12,
            fontWeight: 500,
            cursor: "pointer",
          }}
        >
          {editing ? "Done" : "Edit →"}
        </button>
      </div>

      <div style={{ padding: "10px 16px 14px" }}>
        {prefs.length === 0 && !adding && (
          <div style={{ fontSize: 12, color: "var(--text-subtle)", padding: "6px 0" }}>
            No preferences recorded yet.
          </div>
        )}

        {prefs.map((p) => (
          <div key={p.id} style={rowStyle}>
            <span style={{ fontSize: 11, color: "var(--text-subtle)", fontWeight: 500, flexShrink: 0 }}>
              {labelFor(p.category)}
            </span>
            {editing ? (
              <span style={{ display: "flex", gap: 6, alignItems: "center", flex: 1, justifyContent: "flex-end" }}>
                <input
                  defaultValue={p.value}
                  onBlur={(e) => {
                    if (e.target.value.trim() !== p.value) saveEdit(p.id, e.target.value);
                  }}
                  style={{ ...inputStyle, maxWidth: 150 }}
                />
                <button
                  onClick={() => remove(p.id)}
                  aria-label={`Remove ${labelFor(p.category)} preference`}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--error)",
                    fontSize: 14,
                    cursor: "pointer",
                    padding: "0 2px",
                    lineHeight: 1,
                  }}
                >
                  ×
                </button>
              </span>
            ) : (
              <span style={{ fontSize: 12, color: "var(--text)", textAlign: "right" }}>
                {p.value}
              </span>
            )}
          </div>
        ))}

        {/* add row */}
        {editing && !adding && (
          <button
            onClick={() => setAdding(true)}
            style={{
              marginTop: 10,
              background: "var(--bg-subtle)",
              border: "1px solid var(--border)",
              borderRadius: 6,
              padding: "5px 11px",
              fontSize: 12,
              fontWeight: 500,
              color: "var(--text-muted)",
              cursor: "pointer",
            }}
          >
            + Add preference
          </button>
        )}

        {adding && (
          <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 7 }}>
            <div style={{ display: "flex", gap: 6 }}>
              <select
                value={newCat}
                onChange={(e) => setNewCat(e.target.value)}
                style={{ ...inputStyle, width: 110, flexShrink: 0 }}
              >
                {CATEGORIES.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label}
                  </option>
                ))}
              </select>
              <input
                value={newVal}
                onChange={(e) => setNewVal(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") add();
                  if (e.key === "Escape") {
                    setAdding(false);
                    setNewVal("");
                  }
                }}
                placeholder="e.g. BA, window seat, no long-haul"
                autoFocus
                style={inputStyle}
              />
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button
                onClick={add}
                disabled={busy || !newVal.trim()}
                style={{
                  background: "var(--tg-primary)",
                  border: "1px solid var(--tg-primary)",
                  borderRadius: 6,
                  padding: "5px 12px",
                  fontSize: 12,
                  fontWeight: 500,
                  color: "white",
                  cursor: busy ? "wait" : "pointer",
                  opacity: !newVal.trim() ? 0.6 : 1,
                }}
              >
                {busy ? "Saving…" : "Save"}
              </button>
              <button
                onClick={() => {
                  setAdding(false);
                  setNewVal("");
                  setError(null);
                }}
                style={{
                  background: "none",
                  border: "1px solid var(--border)",
                  borderRadius: 6,
                  padding: "5px 12px",
                  fontSize: 12,
                  color: "var(--text-muted)",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {error && (
          <div style={{ fontSize: 11.5, color: "var(--error)", marginTop: 8 }}>{error}</div>
        )}
      </div>
    </div>
  );
}
