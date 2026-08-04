"use client";

/**
 * Log a note or a call, right on the Timeline.
 *
 * The compose actions used to live only inside the AI Brief panel, which is
 * not where anyone looks to "add to the record". This puts them at the top of
 * the Timeline itself, and adds an optional date so a call taken yesterday can
 * be logged with yesterday's date (the server clamps the future to now).
 *
 * Writes the same interactions row as the brief-panel composer, via
 * POST /api/customers/[id]/note, then refreshes so the entry appears in order.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/toast/toast";

export function TimelineCompose({ householdId }: { householdId: string }) {
  const router = useRouter();
  const { push } = useToast();
  const [kind, setKind] = useState<"note" | "call" | null>(null);
  const [text, setText] = useState("");
  const [when, setWhen] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(next: "note" | "call") {
    setError(null);
    setKind((k) => (k === next ? null : next));
  }

  async function save() {
    setError(null);
    setSaving(true);
    try {
      const res = await fetch(`/api/customers/${householdId}/note`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, body: text, occurred_at: when || null }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error || "Couldn't save that.");
      const wasCall = kind === "call";
      setText("");
      setWhen("");
      setKind(null);
      push(wasCall ? "Call logged" : "Note added");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save that.");
    } finally {
      setSaving(false);
    }
  }

  const tab = (active: boolean): React.CSSProperties => ({
    background: active ? "var(--tg-primary)" : "var(--surface)",
    color: active ? "white" : "var(--text-muted)",
    border: `1px solid ${active ? "var(--tg-primary)" : "var(--border)"}`,
    borderRadius: 7,
    padding: "5px 11px",
    fontSize: 12.5,
    fontWeight: 600,
    cursor: "pointer",
  });

  const smallField: React.CSSProperties = {
    border: "1px solid var(--border)",
    borderRadius: 7,
    background: "var(--surface)",
    color: "var(--text)",
    padding: "6px 9px",
    fontSize: 12.5,
    fontFamily: "inherit",
  };

  return (
    <div style={{ padding: 14, borderBottom: "1px solid var(--border)" }}>
      <div style={{ display: "flex", gap: 6 }}>
        <button style={tab(kind === "note")} onClick={() => toggle("note")}>Add note</button>
        <button style={tab(kind === "call")} onClick={() => toggle("call")}>Log a call</button>
      </div>

      {kind && (
        <div style={{ marginTop: 10 }}>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={
              kind === "call"
                ? "What was discussed on the call?"
                : "Add an internal note."
            }
            rows={3}
            autoFocus
            style={{
              width: "100%",
              resize: "vertical",
              borderRadius: 8,
              border: "1px solid var(--border)",
              background: "var(--surface)",
              color: "var(--text)",
              padding: "8px 10px",
              fontSize: 13,
              fontFamily: "inherit",
            }}
          />
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 7, flexWrap: "wrap" }}>
            <label style={{ fontSize: 11.5, color: "var(--text-muted)" }}>
              When{" "}
              <input
                type="date"
                value={when}
                onChange={(e) => setWhen(e.target.value)}
                style={{ ...smallField, marginLeft: 4 }}
                aria-label="When it happened (optional — defaults to now)"
              />
            </label>
            <span style={{ fontSize: 11, color: "var(--text-subtle)" }}>Leave blank for now</span>
            <div style={{ flex: 1 }} />
            {error && <span style={{ fontSize: 11.5, color: "var(--error)" }}>{error}</span>}
            <button
              onClick={() => { setKind(null); setError(null); }}
              style={{ background: "transparent", border: "1px solid var(--border)", borderRadius: 7, padding: "6px 11px", fontSize: 12.5, color: "var(--text-muted)", cursor: "pointer" }}
            >
              Cancel
            </button>
            <button
              onClick={save}
              disabled={saving || !text.trim()}
              style={{
                background: "var(--tg-primary)",
                border: "1px solid var(--tg-primary)",
                borderRadius: 7,
                padding: "6px 13px",
                fontSize: 12.5,
                fontWeight: 600,
                color: "white",
                cursor: saving || !text.trim() ? "default" : "pointer",
                opacity: saving || !text.trim() ? 0.6 : 1,
              }}
            >
              {saving ? "Saving…" : kind === "call" ? "Log call" : "Save note"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
