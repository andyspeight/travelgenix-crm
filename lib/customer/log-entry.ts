/**
 * Logging a note or a call onto a customer's timeline.
 *
 * The timeline already knows how to show a note and a call — it renders both
 * kinds with their own label and colour. What was missing was any way to put a
 * call there: an agent could take a booking over the phone and the record
 * would show nothing. "Schedule call" makes a task for a FUTURE call; this is
 * for the one that just happened.
 *
 * A note and a call are the same write with a different label, so they share
 * one validator rather than drifting into two. Pure: the API supplies the
 * agency and household, this only decides whether the text is loggable and
 * which row it becomes.
 */

export type LogEntryKind = "note" | "call";

export type LogEntryInput = { kind?: unknown; body?: unknown };

export type LogEntryResult =
  | { ok: true; kind: LogEntryKind; body: string }
  | { ok: false; error: string };

/** Generous for a note or a call summary; a bound, not a target. */
export const MAX_LOG_BODY = 4000;

/**
 * Decide whether this is a loggable note/call. Unknown kinds fall to "note"
 * rather than erroring, because the safe default is the less specific claim —
 * calling something a phone call when it wasn't is the mistake to avoid.
 */
export function validateLogEntry(input: LogEntryInput): LogEntryResult {
  const kind: LogEntryKind = input.kind === "call" ? "call" : "note";
  const body = typeof input.body === "string" ? input.body.trim() : "";
  if (!body) {
    return {
      ok: false,
      error: kind === "call" ? "Add a line on what was discussed." : "Note is empty.",
    };
  }
  if (body.length > MAX_LOG_BODY) {
    return { ok: false, error: "That's too long — keep it under 4000 characters." };
  }
  return { ok: true, kind, body };
}

/**
 * The interaction columns for a validated entry. One place that decides what a
 * call row and a note row look like, so the timeline's labels can rely on it.
 */
export function logEntryRow(kind: LogEntryKind): {
  kind: LogEntryKind;
  channel: string;
  subject: string;
} {
  return kind === "call"
    ? { kind: "call", channel: "phone", subject: "Call logged" }
    : { kind: "note", channel: "note", subject: "Note" };
}
