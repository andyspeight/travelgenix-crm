/**
 * Query tool: tasks_due
 *
 * Answers "what's due today?", "my overdue tasks", "what follow-ups are open?".
 * Reads the tasks queue (open/doing) and buckets by due date against the
 * injected now — overdue first, then due today, then the next few days.
 */

import {
  type QueryTool,
  type QueryResult,
  type ResultRow,
  type Signal,
  listResult,
} from "../contract";

type TaskLite = {
  id: string;
  household_id: string | null;
  title: string;
  status: string;
  priority: number | null;
  due_at: string | null;
};

export const tasksDue: QueryTool = {
  name: "tasks_due",
  description:
    "List open tasks and follow-ups by when they're due: overdue, due today, and coming up. Use for 'what's due today', 'overdue tasks', 'what follow-ups are open', 'my to-do list', 'what needs doing this week'.",
  examples: [
    "What's due today?",
    "Show me my overdue tasks",
    "What follow-ups are open?",
    "What needs doing this week?",
    "Any overdue reminders?",
  ],
  params: [
    {
      name: "days",
      type: "number",
      required: false,
      description: "How many days ahead to include as 'coming up' (default 7).",
    },
  ],
  run: async (args, ctx): Promise<QueryResult> => {
    const windowDays = args.days != null && !Number.isNaN(Number(args.days)) ? Math.min(Math.max(Number(args.days), 1), 90) : 7;

    const [{ data: taskRows }, { data: households }] = await Promise.all([
      ctx.db
        .from("tasks")
        .select("id, household_id, title, status, priority, due_at")
        .eq("agency_id", ctx.agencyId)
        .in("status", ["open", "doing"])
        .limit(300),
      ctx.db.from("households").select("id, display_name").eq("agency_id", ctx.agencyId),
    ]);

    const nameById = new Map<string, string>(
      ((households ?? []) as { id: string; display_name: string }[]).map((h) => [h.id, h.display_name])
    );
    const tasks = (taskRows ?? []) as TaskLite[];

    const nowMs = ctx.now.getTime();
    const dayMs = 86_400_000;
    const horizon = nowMs + windowDays * dayMs;
    const startOfTomorrow = new Date(ctx.now);
    startOfTomorrow.setHours(24, 0, 0, 0);

    const bucketOf = (due: string | null): "overdue" | "today" | "soon" | null => {
      if (!due) return null;
      const t = Date.parse(due);
      if (Number.isNaN(t)) return null;
      if (t < nowMs) return "overdue";
      if (t < startOfTomorrow.getTime()) return "today";
      if (t <= horizon) return "soon";
      return null;
    };

    const scored = tasks
      .map((t) => ({ t, bucket: bucketOf(t.due_at) }))
      .filter((x): x is { t: TaskLite; bucket: "overdue" | "today" | "soon" } => x.bucket !== null)
      .sort((a, b) => Date.parse(a.t.due_at as string) - Date.parse(b.t.due_at as string));

    if (scored.length === 0) {
      return listResult([], `Nothing due in the next ${windowDays} days. You're on top of it.`);
    }

    const label: Record<string, string> = { overdue: "Overdue", today: "Today", soon: "Coming up" };
    const rows: ResultRow[] = scored.slice(0, 30).map(({ t, bucket }) => ({
      id: t.id,
      href: t.household_id ? `/customers/${t.household_id}` : "/tasks",
      title: t.title,
      subtitle: [t.household_id ? nameById.get(t.household_id) : null, fmtDue(t.due_at, nowMs)].filter(Boolean).join(" · "),
      badges: [label[bucket]],
      meta: { bucket },
    }));

    const overdue = scored.filter((x) => x.bucket === "overdue").length;
    const today = scored.filter((x) => x.bucket === "today").length;

    const signals: Signal[] = [
      {
        kind: "tasks_due",
        detail:
          (overdue ? `${overdue} overdue` : "none overdue") +
          (today ? `, ${today} due today` : "") +
          `, ${scored.length} in the next ${windowDays} days`,
        severity: overdue ? "warning" : "info",
        rowIds: scored.filter((x) => x.bucket === "overdue").map((x) => x.t.id),
      },
    ];

    const summary =
      (overdue ? `${overdue} overdue task${overdue === 1 ? "" : "s"}` : `${scored.length} task${scored.length === 1 ? "" : "s"} due`) +
      (today ? ` and ${today} due today.` : ".");
    return listResult(rows, summary, signals, true);
  },
};

function fmtDue(due: string | null, nowMs: number): string {
  if (!due) return "";
  const t = Date.parse(due);
  if (Number.isNaN(t)) return "";
  const days = Math.round((t - nowMs) / 86_400_000);
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return "due today";
  if (days === 1) return "due tomorrow";
  return `due in ${days}d`;
}
