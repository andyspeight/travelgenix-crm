/**
 * Query tool: open_cases
 *
 * Answers "any open complaints?", "what service cases are overdue?", "anyone
 * with an unresolved case?". Lists live service cases ordered by the same
 * travel-aware priority the /service queue and the 360 panel use
 * (lib/cases/priority.ts), so Luna's answer and the screens can't disagree.
 *
 * The signal is deterministic: how many are open and how many have blown their
 * SLA. A complaint is the one thing that must never be missed, and the whole
 * priority engine already exists — it just had no spoken surface.
 */

import {
  type QueryTool,
  type QueryResult,
  type ResultRow,
  type Signal,
  listResult,
} from "../contract";
import {
  PRIORITY_META,
  CASE_STATUS_LABELS,
  CASE_TYPE_LABELS,
  type CaseType,
} from "@/lib/cases/priority";
import type { CaseRow, CaseStatus } from "@/lib/supabase/types";

const OPEN_STATUSES: CaseStatus[] = ["open", "in_progress", "waiting"];

export const openCases: QueryTool = {
  name: "open_cases",
  description:
    "List open service cases and complaints: unresolved customer issues, ranked by travel-aware priority, flagging any past their SLA. Use for 'any open complaints', 'what service cases are overdue', 'unresolved cases', 'who has an open issue', 'what needs resolving'.",
  examples: [
    "Any open complaints?",
    "What service cases are overdue?",
    "Show me unresolved cases",
    "Which cases have breached their SLA?",
    "Anyone with an open issue right now?",
  ],
  params: [],
  run: async (_args, ctx): Promise<QueryResult> => {
    const [{ data: caseRows }, { data: households }] = await Promise.all([
      ctx.db
        .from("cases")
        .select("id, household_id, case_type, subject, status, priority, sla_due_at, opened_at")
        .eq("agency_id", ctx.agencyId)
        .in("status", OPEN_STATUSES)
        .order("priority", { ascending: true })
        .order("sla_due_at", { ascending: true, nullsFirst: false })
        .limit(200),
      ctx.db.from("households").select("id, display_name").eq("agency_id", ctx.agencyId),
    ]);

    const nameById = new Map<string, string>(
      ((households ?? []) as { id: string; display_name: string }[]).map((h) => [h.id, h.display_name])
    );
    const cases = (caseRows ?? []) as Pick<
      CaseRow,
      "id" | "household_id" | "case_type" | "subject" | "status" | "priority" | "sla_due_at" | "opened_at"
    >[];

    if (cases.length === 0) {
      return listResult([], "No open service cases. Everything raised has been resolved.");
    }

    const nowMs = ctx.now.getTime();
    const isBreached = (sla: string | null) => Boolean(sla) && Date.parse(sla as string) < nowMs;

    const rows: ResultRow[] = cases.map((c) => {
      const who = c.household_id ? nameById.get(c.household_id) : null;
      const breached = isBreached(c.sla_due_at);
      const badges = [PRIORITY_META[c.priority].label, CASE_STATUS_LABELS[c.status]];
      if (breached) badges.push("SLA breached");
      return {
        id: c.id,
        href: c.household_id ? `/customers/${c.household_id}` : "/service",
        title: c.subject,
        subtitle: [CASE_TYPE_LABELS[c.case_type as CaseType] ?? c.case_type, who].filter(Boolean).join(" · "),
        badges,
        meta: { priority: c.priority, status: c.status },
      };
    });

    const overdue = cases.filter((c) => isBreached(c.sla_due_at)).length;
    const p1 = cases.filter((c) => c.priority === 1).length;

    const signals: Signal[] = [
      {
        kind: "open_cases",
        detail:
          `${cases.length} open case${cases.length === 1 ? "" : "s"}` +
          (overdue ? `, ${overdue} past SLA` : "") +
          (p1 ? `, ${p1} act-now (P1)` : ""),
        severity: overdue || p1 ? "warning" : "info",
        rowIds: cases.filter((c) => c.priority === 1 || isBreached(c.sla_due_at)).map((c) => c.id),
      },
    ];

    const summary =
      `${cases.length} open service case${cases.length === 1 ? "" : "s"}` +
      (overdue ? `, ${overdue} past their SLA.` : ".");
    return listResult(rows, summary, signals, true);
  },
};
