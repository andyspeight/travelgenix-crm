"use client";

/**
 * Tasks view — client component. Owns the status filter and the per-task
 * actions (complete, snooze, reopen). Each action PATCHes /api/tasks/[id] then
 * router.refresh()es so the server re-buckets. Real writes, so we wait for the
 * server rather than guessing.
 */

import { useState, useTransition, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CheckSquareIcon, ClockIcon, ZapIcon, NoteIcon } from "@/components/ui/icons";
import { AddTask } from "./add-task";

export type TaskRow = {
  id: string;
  household_id: string | null;
  trip_id: string | null;
  assigned_to: string | null;
  title: string;
  description: string | null;
  status: string;
  priority: number | null;
  due_at: string | null;
  completed_at: string | null;
  source: string | null;
  source_meta: { journey?: string; reason?: string } | null;
  created_at: string;
};

type Filter = "open" | "snoozed" | "done" | "all";

export function TasksView({
  tasks,
  nameById,
  memberById = {},
  customers,
}: {
  tasks: TaskRow[];
  nameById: Record<string, string>;
  memberById?: Record<string, string>;
  customers: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("open");

  const counts = useMemo(() => {
    let open = 0,
      snoozed = 0,
      done = 0;
    for (const t of tasks) {
      if (t.status === "open" || t.status === "doing") open++;
      else if (t.status === "snoozed") snoozed++;
      else if (t.status === "done") done++;
    }
    return { open, snoozed, done, all: tasks.length };
  }, [tasks]);

  const setStatus = useCallback(
    async (id: string, status: string) => {
      setBusy(id);
      try {
        const res = await fetch(`/api/tasks/${id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ status }),
        });
        if (res.ok) startTransition(() => router.refresh());
      } finally {
        setBusy(null);
      }
    },
    [router]
  );

  // Filter, then bucket the open list by due date.
  const visible = useMemo(() => {
    if (filter === "open") return tasks.filter((t) => t.status === "open" || t.status === "doing");
    if (filter === "snoozed") return tasks.filter((t) => t.status === "snoozed");
    if (filter === "done") return tasks.filter((t) => t.status === "done");
    return tasks;
  }, [tasks, filter]);

  const groups = useMemo(() => {
    if (filter !== "open") return [{ label: null as string | null, items: visible }];
    const overdue: TaskRow[] = [];
    const today: TaskRow[] = [];
    const week: TaskRow[] = [];
    const later: TaskRow[] = [];
    const undated: TaskRow[] = [];
    for (const t of visible) {
      const d = daysUntil(t.due_at);
      if (d == null) undated.push(t);
      else if (d < 0) overdue.push(t);
      else if (d === 0) today.push(t);
      else if (d <= 7) week.push(t);
      else later.push(t);
    }
    return [
      { label: "Overdue", items: overdue },
      { label: "Today", items: today },
      { label: "This week", items: week },
      { label: "Later", items: later },
      { label: "No due date", items: undated },
    ].filter((g) => g.items.length > 0);
  }, [visible, filter]);

  const filters: { id: Filter; label: string; count: number }[] = [
    { id: "open", label: "Open", count: counts.open },
    { id: "snoozed", label: "Snoozed", count: counts.snoozed },
    { id: "done", label: "Done", count: counts.done },
    { id: "all", label: "All", count: counts.all },
  ];

  return (
    <div style={{ padding: 28, maxWidth: 1000, margin: "0 auto", width: "100%" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 18 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em", margin: "0 0 4px" }}>
            Tasks
          </h1>
          <p style={{ fontSize: 14, color: "var(--text-muted)", margin: 0 }}>
            Everything that needs doing, including the follow-ups Luna queues from journeys.
          </p>
        </div>
        <AddTask customers={customers} />
      </div>

      {/* Filter tabs */}
      <div style={{ display: "flex", gap: 6, marginBottom: 18 }}>
        {filters.map((f) => {
          const active = filter === f.id;
          return (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              style={{
                background: active ? "var(--tg-primary)" : "var(--surface)",
                color: active ? "white" : "var(--text-muted)",
                border: `1px solid ${active ? "var(--tg-primary)" : "var(--border)"}`,
                borderRadius: 7,
                padding: "6px 12px",
                fontSize: 12.5,
                fontWeight: 500,
                display: "inline-flex",
                alignItems: "center",
                gap: 7,
              }}
            >
              {f.label}
              <span
                className="mono"
                style={{
                  fontSize: 11,
                  color: active ? "rgba(255,255,255,0.85)" : "var(--text-subtle)",
                }}
              >
                {f.count}
              </span>
            </button>
          );
        })}
      </div>

      {visible.length === 0 ? (
        <EmptyState filter={filter} />
      ) : (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 18,
            opacity: pending ? 0.6 : 1,
            transition: "opacity 0.15s ease",
          }}
        >
          {groups.map((g, gi) => (
            <div key={g.label ?? gi}>
              {g.label && (
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    color: g.label === "Overdue" ? "var(--error)" : "var(--text-subtle)",
                    marginBottom: 8,
                  }}
                >
                  {g.label}
                  <span style={{ color: "var(--text-subtle)", marginLeft: 7, fontWeight: 400 }}>
                    {g.items.length}
                  </span>
                </div>
              )}
              <div
                style={{
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: 12,
                  overflow: "hidden",
                  boxShadow: "var(--shadow-sm)",
                }}
              >
                {g.items.map((t, i) => (
                  <TaskItem
                    key={t.id}
                    task={t}
                    name={t.household_id ? nameById[t.household_id] ?? null : null}
                    assignee={t.assigned_to ? memberById[t.assigned_to] ?? null : null}
                    busy={busy === t.id}
                    last={i === g.items.length - 1}
                    onStatus={setStatus}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TaskItem({
  task,
  name,
  assignee,
  busy,
  last,
  onStatus,
}: {
  task: TaskRow;
  name: string | null;
  assignee: string | null;
  busy: boolean;
  last: boolean;
  onStatus: (id: string, status: string) => void;
}) {
  const isDone = task.status === "done";
  const isSnoozed = task.status === "snoozed";
  const d = daysUntil(task.due_at);
  const fromJourney = task.source === "journey";

  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 12,
        padding: "13px 15px",
        borderBottom: last ? "none" : "1px solid var(--border)",
        opacity: isDone ? 0.65 : 1,
      }}
    >
      {/* Complete toggle */}
      <button
        onClick={() => onStatus(task.id, isDone ? "open" : "done")}
        disabled={busy}
        title={isDone ? "Reopen" : "Mark done"}
        style={{
          width: 20,
          height: 20,
          marginTop: 1,
          borderRadius: 6,
          border: `1.5px solid ${isDone ? "var(--success)" : "var(--border-strong)"}`,
          background: isDone ? "var(--success)" : "transparent",
          color: "white",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          padding: 0,
        }}
      >
        {isDone && <CheckSquareIcon width={12} height={12} />}
      </button>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 13.5,
            fontWeight: 500,
            color: "var(--text)",
            textDecoration: isDone ? "line-through" : "none",
          }}
        >
          {task.title}
        </div>
        {task.description && (
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2, lineHeight: 1.45 }}>
            {task.description}
          </div>
        )}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: 10,
            marginTop: 7,
          }}
        >
          {name && task.household_id && (
            <Link
              href={`/customers/${task.household_id}`}
              style={{
                fontSize: 11.5,
                color: "var(--tg-accent-dark)",
                textDecoration: "none",
                fontWeight: 500,
              }}
            >
              {name}
            </Link>
          )}
          {assignee && (
            <span
              style={{
                fontSize: 11,
                color: "var(--text-muted)",
                background: "var(--bg-subtle)",
                border: "1px solid var(--border)",
                borderRadius: 5,
                padding: "2px 7px",
                fontWeight: 500,
              }}
            >
              {assignee}
            </span>
          )}
          {task.due_at && (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                fontSize: 11,
                fontWeight: 500,
                color: !isDone && d != null && d < 0 ? "var(--error)" : "var(--text-subtle)",
              }}
            >
              <ClockIcon width={11} height={11} />
              {dueLabel(task.due_at)}
            </span>
          )}
          {fromJourney && (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                fontSize: 10.5,
                fontWeight: 600,
                color: "var(--tg-accent-dark)",
                background: "rgba(0,180,216,0.08)",
                padding: "2px 7px",
                borderRadius: 999,
              }}
              title={task.source_meta?.journey ? `Journey: ${task.source_meta.journey}` : "Created by a journey"}
            >
              <ZapIcon width={10} height={10} />
              {task.source_meta?.journey ?? "Journey"}
            </span>
          )}
          {isSnoozed && (
            <span style={{ fontSize: 10.5, fontWeight: 600, color: "var(--warning)" }}>Snoozed</span>
          )}
        </div>
      </div>

      {/* Row actions */}
      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
        {!isDone && !isSnoozed && (
          <RowButton onClick={() => onStatus(task.id, "snoozed")} disabled={busy} title="Snooze 3 days">
            <NoteIcon width={13} height={13} />
          </RowButton>
        )}
        {(isDone || isSnoozed) && (
          <button
            onClick={() => onStatus(task.id, "open")}
            disabled={busy}
            style={{
              background: "transparent",
              border: "1px solid var(--border)",
              borderRadius: 6,
              padding: "4px 10px",
              fontSize: 12,
              fontWeight: 500,
              color: "var(--text-muted)",
            }}
          >
            Reopen
          </button>
        )}
      </div>
    </div>
  );
}

function RowButton({
  onClick,
  disabled,
  title,
  children,
}: {
  onClick: () => void;
  disabled: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        background: "transparent",
        border: "1px solid var(--border)",
        borderRadius: 6,
        width: 28,
        height: 28,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        color: "var(--text-muted)",
      }}
    >
      {children}
    </button>
  );
}

function EmptyState({ filter }: { filter: Filter }) {
  const text: Record<Filter, string> = {
    open: "No open tasks. When a journey fires or you add a follow-up, it lands here.",
    snoozed: "Nothing snoozed.",
    done: "No completed tasks yet.",
    all: "No tasks yet. Run a journey to see Luna queue some work.",
  };
  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 14,
        padding: 40,
        textAlign: "center",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: 11,
          background: "var(--bg-subtle)",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--tg-accent-dark)",
          marginBottom: 12,
        }}
      >
        <CheckSquareIcon width={20} height={20} />
      </div>
      <p style={{ fontSize: 13.5, color: "var(--text-muted)", margin: "0 auto", maxWidth: 380 }}>
        {text[filter]}
      </p>
    </div>
  );
}

// ─── helpers ────────────────────────────────────────────────────────────────

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  const a = new Date();
  a.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - a.getTime()) / 86400000);
}

function dueLabel(dateStr: string): string {
  const d = daysUntil(dateStr);
  if (d == null) return "";
  if (d < 0) return `${-d}d overdue`;
  if (d === 0) return "Due today";
  if (d === 1) return "Due tomorrow";
  if (d <= 7) return `Due in ${d}d`;
  return new Date(dateStr).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
