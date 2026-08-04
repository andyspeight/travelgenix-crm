"use client";

/**
 * Add task — the button + modal on the /tasks queue. Creates a free-form task
 * (title, optional due date, priority, optional linked customer) via
 * POST /api/tasks, then refreshes so it drops into the right bucket.
 *
 * The queue used to be read-only for creation: tasks could only be born from a
 * 360 quick action. This is the "just add a reminder" path.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PlusIcon, XIcon } from "@/components/ui/icons";

const field: React.CSSProperties = {
  width: "100%",
  border: "1px solid var(--border)",
  borderRadius: 7,
  background: "var(--surface)",
  color: "var(--text)",
  padding: "7px 10px",
  fontSize: 13,
  fontFamily: "inherit",
};

const label: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: "var(--text-muted)",
  display: "block",
  marginBottom: 3,
};

export function AddTask({
  customers,
  open: openProp,
  onClose,
  hideTrigger = false,
}: {
  customers: { id: string; name: string }[];
  /** Controlled mode for the global quick-add; omit to self-manage + show the
   *  "Add task" button. */
  open?: boolean;
  onClose?: () => void;
  hideTrigger?: boolean;
}) {
  const router = useRouter();
  const [selfOpen, setSelfOpen] = useState(false);
  const controlled = openProp !== undefined;
  const open = controlled ? openProp : selfOpen;
  const setOpen = (next: boolean) => {
    if (controlled) {
      if (!next) onClose?.();
    } else {
      setSelfOpen(next);
    }
  };
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [priority, setPriority] = useState("0");
  const [householdId, setHouseholdId] = useState("");

  function reset() {
    setTitle("");
    setDue("");
    setPriority("0");
    setHouseholdId("");
    setError(null);
  }

  async function save() {
    setError(null);
    setSaving(true);
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          due_at: due || null,
          priority: Number(priority),
          household_id: householdId || null,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error || `Failed (${res.status})`);
      setOpen(false);
      reset();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create the task");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {!hideTrigger && (
        <button
          onClick={() => { setOpen(true); setError(null); }}
          style={{
            background: "var(--tg-primary)",
            border: "1px solid var(--tg-primary)",
            borderRadius: 7,
            padding: "7px 12px",
            color: "white",
            fontSize: 12.5,
            fontWeight: 600,
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            cursor: "pointer",
          }}
        >
          <PlusIcon width={14} height={14} />
          Add task
        </button>
      )}

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Add task"
          onClick={() => setOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 120,
            background: "rgba(2, 6, 23, 0.5)",
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "center",
            padding: "12vh 16px 16px",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 400,
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 14,
              boxShadow: "var(--shadow-lg)",
              padding: 20,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "var(--text)" }}>Add task</h2>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close"
                style={{ background: "transparent", border: "1px solid var(--border)", borderRadius: 6, width: 26, height: 26, color: "var(--text-muted)", display: "inline-flex", alignItems: "center", justifyContent: "center" }}
              >
                <XIcon width={13} height={13} />
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div>
                <span style={label}>Task *</span>
                <input
                  style={field}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && title.trim() && !saving) void save(); }}
                  placeholder="e.g. Call the Thompsons about their Maldives balance"
                  autoFocus
                />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <span style={label}>Due date</span>
                  <input type="date" style={field} value={due} onChange={(e) => setDue(e.target.value)} />
                </div>
                <div>
                  <span style={label}>Priority</span>
                  <select style={field} value={priority} onChange={(e) => setPriority(e.target.value)}>
                    <option value="0">Normal</option>
                    <option value="1">High</option>
                    <option value="2">Urgent</option>
                  </select>
                </div>
              </div>
              <div>
                <span style={label}>Customer (optional)</span>
                <select style={field} value={householdId} onChange={(e) => setHouseholdId(e.target.value)}>
                  <option value="">— No customer —</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              {error && <div style={{ fontSize: 12, color: "var(--error)" }}>{error}</div>}

              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
                <button
                  onClick={() => setOpen(false)}
                  style={{ background: "transparent", border: "1px solid var(--border)", borderRadius: 7, padding: "7px 13px", fontSize: 13, color: "var(--text-muted)", cursor: "pointer" }}
                >
                  Cancel
                </button>
                <button
                  onClick={save}
                  disabled={saving || !title.trim()}
                  style={{
                    background: "var(--tg-primary)",
                    border: "none",
                    borderRadius: 7,
                    padding: "7px 15px",
                    fontSize: 13,
                    fontWeight: 600,
                    color: "white",
                    cursor: saving || !title.trim() ? "default" : "pointer",
                    opacity: saving || !title.trim() ? 0.6 : 1,
                  }}
                >
                  {saving ? "Adding…" : "Add task"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
