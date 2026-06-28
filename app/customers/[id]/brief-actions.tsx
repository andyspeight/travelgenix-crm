"use client";

/**
 * Customer 360 action buttons, all wired:
 *   - Draft a reply  -> deep-links the inbox to the latest inbound message (or
 *                       the inbox itself if there's nothing to reply to).
 *   - Add note       -> reveals an inline composer; POSTs to /note, which writes
 *                       an interaction that shows in the timeline on refresh.
 *   - Schedule call  -> POSTs a follow-up task (due tomorrow) to /task; if a
 *                       Calendly URL is configured it also opens the booking page.
 *   - Refresh brief  -> regenerates the AI brief + scores.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

const CALENDLY_URL = process.env.NEXT_PUBLIC_CALENDLY_URL;

export function BriefActions({
  householdId,
  latestInboundId,
}: {
  householdId: string;
  latestInboundId: string | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [scheduling, setScheduling] = useState(false);

  const busy = loading || isPending;

  async function refresh() {
    setError(null);
    setFlash(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/customers/${householdId}/brief`, { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error || `Failed (${res.status})`);
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't refresh the brief");
    } finally {
      setLoading(false);
    }
  }

  function draftReply() {
    setError(null);
    if (latestInboundId) {
      router.push(`/inbox?id=${latestInboundId}&lane=all`);
    } else {
      router.push(`/inbox?lane=all`);
    }
  }

  async function saveNote() {
    const body = noteText.trim();
    if (!body) {
      setNoteOpen(false);
      return;
    }
    setError(null);
    setSavingNote(true);
    try {
      const res = await fetch(`/api/customers/${householdId}/note`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error || `Failed (${res.status})`);
      setNoteText("");
      setNoteOpen(false);
      setFlash("Note added");
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save the note");
    } finally {
      setSavingNote(false);
    }
  }

  async function scheduleCall() {
    setError(null);
    setFlash(null);
    setScheduling(true);
    try {
      const res = await fetch(`/api/customers/${householdId}/task`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "schedule_call" }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error || `Failed (${res.status})`);
      if (CALENDLY_URL) window.open(CALENDLY_URL, "_blank", "noopener,noreferrer");
      setFlash(CALENDLY_URL ? "Task added · booking page opened" : "Call task added to your queue");
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't schedule the call");
    } finally {
      setScheduling(false);
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
    <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
        <button onClick={draftReply} style={baseBtn}>
          Draft a reply
        </button>
        <button onClick={() => { setNoteOpen((o) => !o); setError(null); }} style={baseBtn}>
          Add note
        </button>
        <button onClick={scheduleCall} disabled={scheduling} aria-busy={scheduling} style={{ ...baseBtn, cursor: scheduling ? "wait" : "pointer", opacity: scheduling ? 0.7 : 1 }}>
          {scheduling ? "Scheduling…" : "Schedule call"}
        </button>
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
        {flash && <span style={{ fontSize: 11.5, color: "var(--success)" }}>{flash}</span>}
        {error && <span style={{ fontSize: 11.5, color: "var(--error)" }}>{error}</span>}
      </div>

      {noteOpen && (
        <div style={{ marginTop: 10 }}>
          <textarea
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            placeholder="Add an internal note. It appears in the timeline."
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
          <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
            <button
              onClick={saveNote}
              disabled={savingNote || !noteText.trim()}
              style={{
                ...baseBtn,
                color: "white",
                background: "var(--tg-primary)",
                borderColor: "var(--tg-primary)",
                cursor: savingNote || !noteText.trim() ? "default" : "pointer",
                opacity: savingNote || !noteText.trim() ? 0.6 : 1,
              }}
            >
              {savingNote ? "Saving…" : "Save note"}
            </button>
            <button onClick={() => { setNoteOpen(false); setNoteText(""); }} style={baseBtn}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
