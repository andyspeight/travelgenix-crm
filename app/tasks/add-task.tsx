"use client";

/**
 * Add task — the button + modal on the /tasks queue. Creates a free-form task
 * (title, optional due date, priority, optional linked customer) via
 * POST /api/tasks, then refreshes so it drops into the right bucket.
 *
 * The queue used to be read-only for creation: tasks could only be born from a
 * 360 quick action. This is the "just add a reminder" path.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PlusIcon } from "@/components/ui/icons";
import { CustomerCombobox } from "@/components/customer-combobox";
import { useToast } from "@/components/toast/toast";
import { Modal } from "@/components/ui/modal";

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
  customers = [],
  defaultCustomerId,
  open: openProp,
  onClose,
  hideTrigger = false,
}: {
  /** The customer options. When empty, they're fetched on open (e.g. when
   *  opened from a record that doesn't have the full list to hand). */
  customers?: { id: string; name: string }[];
  /** Pre-select this customer — used when adding a task from a 360. */
  defaultCustomerId?: string;
  /** Controlled mode for the global quick-add; omit to self-manage + show the
   *  "Add task" button. */
  open?: boolean;
  onClose?: () => void;
  hideTrigger?: boolean;
}) {
  const router = useRouter();
  const { push } = useToast();
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
  const [householdId, setHouseholdId] = useState(defaultCustomerId ?? "");
  const [assignedTo, setAssignedTo] = useState("");
  const [members, setMembers] = useState<{ id: string; name: string }[]>([]);
  const [fetchedCustomers, setFetchedCustomers] = useState<{ id: string; name: string }[]>([]);
  const customerOptions = customers.length ? customers : fetchedCustomers;

  // The team is small, so load assignees once the modal is open; also fetch the
  // customer options if the caller didn't hand them in (e.g. from a record).
  useEffect(() => {
    if (!open) return;
    if (!members.length) {
      void fetch("/api/team/members")
        .then((r) => r.json())
        .then((d) => { if (d?.ok && Array.isArray(d.members)) setMembers(d.members); })
        .catch(() => {});
    }
    if (!customers.length && !fetchedCustomers.length) {
      void fetch("/api/customers/options")
        .then((r) => r.json())
        .then((d) => { if (d?.ok && Array.isArray(d.customers)) setFetchedCustomers(d.customers); })
        .catch(() => {});
    }
  }, [open, members.length, customers.length, fetchedCustomers.length]);

  // Pre-select the customer each time the modal opens from a record.
  useEffect(() => {
    if (open && defaultCustomerId) setHouseholdId(defaultCustomerId);
  }, [open, defaultCustomerId]);

  function reset() {
    setTitle("");
    setDue("");
    setPriority("0");
    setHouseholdId("");
    setAssignedTo("");
    setError(null);
  }

  // Quick due-date presets — most follow-ups are today, tomorrow or next week.
  function isoInDays(days: number): string {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  }
  const dueChips: { label: string; days: number }[] = [
    { label: "Today", days: 0 },
    { label: "Tomorrow", days: 1 },
    { label: "Next week", days: 7 },
  ];

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
          assigned_to: assignedTo || null,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error || `Failed (${res.status})`);
      setOpen(false);
      reset();
      push("Task added");
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

      <Modal open={open} onClose={() => setOpen(false)} title="Add task" maxWidth={520}>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
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
                  <div style={{ display: "flex", gap: 5, marginTop: 5 }}>
                    {dueChips.map((chip) => {
                      const chipDate = isoInDays(chip.days);
                      const activeChip = due === chipDate;
                      return (
                        <button
                          key={chip.label}
                          type="button"
                          onClick={() => setDue(activeChip ? "" : chipDate)}
                          style={{
                            background: activeChip ? "var(--tg-primary)" : "var(--bg-subtle)",
                            border: `1px solid ${activeChip ? "var(--tg-primary)" : "var(--border)"}`,
                            color: activeChip ? "white" : "var(--text-muted)",
                            borderRadius: 6,
                            padding: "3px 9px",
                            fontSize: 11.5,
                            fontWeight: 500,
                            cursor: "pointer",
                          }}
                        >
                          {chip.label}
                        </button>
                      );
                    })}
                  </div>
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
              <div style={{ display: "grid", gridTemplateColumns: members.length ? "1fr 1fr" : "1fr", gap: 12 }}>
                <div>
                  <span style={label}>Customer (optional)</span>
                  <CustomerCombobox
                    customers={customerOptions}
                    value={householdId}
                    onChange={setHouseholdId}
                    placeholder="Start typing a customer's name…"
                  />
                </div>
                {members.length > 0 && (
                  <div>
                    <span style={label}>Assign to (optional)</span>
                    <select style={field} value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}>
                      <option value="">— Unassigned —</option>
                      {members.map((m) => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                    </select>
                  </div>
                )}
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
      </Modal>
    </>
  );
}
