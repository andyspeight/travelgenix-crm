/**
 * Query tool: enquiries_awaiting_response
 *
 * Answers "which enquiries are overdue?", "who's waiting on a first response?",
 * "any enquiries breaching SLA?". Runs the SAME response clock the enquiries
 * screen and the dashboard strip use (lib/enquiries/clock.ts), so the spoken
 * answer matches the UI — overdue, warning, or still within target.
 */

import {
  type QueryTool,
  type QueryResult,
  type ResultRow,
  type Signal,
  listResult,
} from "../contract";
import { clockState } from "@/lib/enquiries/clock";
import type { Enquiry } from "@/lib/supabase/types";

export const enquiriesAwaitingResponse: QueryTool = {
  name: "enquiries_awaiting_response",
  description:
    "List new enquiries that have not had a first response yet, ordered by how close they are to (or past) their response target. Use for 'which enquiries are overdue', 'who's waiting on a reply', 'enquiries breaching SLA', 'unanswered enquiries', 'what needs responding to'.",
  examples: [
    "Which enquiries are overdue?",
    "Who's waiting on a first response?",
    "Any enquiries breaching SLA?",
    "Unanswered enquiries",
    "What enquiries need responding to today?",
  ],
  params: [],
  run: async (_args, ctx): Promise<QueryResult> => {
    const { data } = await ctx.db
      .from("enquiries")
      .select("id, household_id, status, contact_name, destination, received_at, first_response_due_at, first_response_at")
      .eq("agency_id", ctx.agencyId)
      .is("first_response_at", null)
      .in("status", ["new"])
      .limit(200);

    const enquiries = (data ?? []) as Pick<
      Enquiry,
      "id" | "household_id" | "status" | "contact_name" | "destination" | "received_at" | "first_response_due_at" | "first_response_at"
    >[];

    if (enquiries.length === 0) {
      return listResult([], "No enquiries awaiting a first response — the inbox is clear.");
    }

    const nowIso = ctx.now.toISOString();
    const withClock = enquiries
      .map((e) => ({
        e,
        clock: clockState({ receivedAt: e.received_at, dueAt: e.first_response_due_at, respondedAt: null, now: nowIso }),
      }))
      // Most urgent first: overdue (most over) then warning then ok.
      .sort((a, b) => a.clock.remainingMs - b.clock.remainingMs);

    const rows: ResultRow[] = withClock.map(({ e, clock }) => {
      const badges: string[] = [];
      if (clock.state === "overdue") badges.push("Overdue");
      else if (clock.state === "warning") badges.push("Due soon");
      return {
        id: e.id,
        href: e.household_id ? `/customers/${e.household_id}` : "/enquiries",
        title: e.contact_name || "New enquiry",
        subtitle: [e.destination, clock.label].filter(Boolean).join(" · "),
        badges,
        meta: { state: clock.state },
      };
    });

    const overdue = withClock.filter((x) => x.clock.state === "overdue").length;
    const warning = withClock.filter((x) => x.clock.state === "warning").length;

    const signals: Signal[] = [
      {
        kind: "response_clock",
        detail:
          `${enquiries.length} awaiting a first response` +
          (overdue ? `, ${overdue} overdue` : "") +
          (warning ? `, ${warning} due soon` : ""),
        severity: overdue ? "warning" : warning ? "warning" : "info",
        rowIds: withClock.filter((x) => x.clock.state !== "ok").map((x) => x.e.id),
      },
    ];

    const summary =
      `${enquiries.length} enquir${enquiries.length === 1 ? "y" : "ies"} awaiting a first response` +
      (overdue ? `, ${overdue} already overdue.` : ".");
    return listResult(rows, summary, signals, true);
  },
};
