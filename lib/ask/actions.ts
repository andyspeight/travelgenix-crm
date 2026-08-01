/**
 * Luna acts — the doing half of Ask.
 *
 * Until now Luna answered and the agent went off and did the work by hand:
 * ask "which customers have gone quiet?", get eleven names, then open eleven
 * records. This closes that gap.
 *
 * THE SHAPE, and every rule here follows from it:
 *
 *   An action runs on THE ROWS OF AN ANSWER LUNA JUST GAVE. The model never
 *   produces an id, never writes a filter, never names a customer. It picks
 *   from a fixed list of verbs; the rows came from a tested query tool that
 *   was already scoped to the agency. There is no path from a sentence to a
 *   database write that does not go through a result the agent has seen.
 *
 *   A PLAN IS NOT AN ACTION. Every request produces a plan first — the verb,
 *   the count, and the names — and nothing is written until the agent
 *   confirms it. "Luna did something to 40 customers" should never be a
 *   discovery.
 *
 *   NOTHING SENDS. Not one action here puts a message in front of a customer.
 *   They create tasks, tags and sequence enrolments, all of which land in a
 *   queue a human works. Sequences themselves default to review mode, so even
 *   an enrolment does not mean an email.
 *
 *   THERE IS A CEILING. An action that would touch more records than a person
 *   could sensibly check is refused, with the number, rather than performed
 *   quietly. Bulk is where a small mistake becomes an expensive one.
 *
 * Pure functions, no I/O.
 */

export type ActionId = "create_task" | "add_tag" | "enrol_sequence";

/** Past this, an agent cannot meaningfully check what they are approving. */
export const MAX_TARGETS = 50;

export type ActionDef = {
  id: ActionId;
  /** The button. */
  label: string;
  /** What it does, shown under the button so nobody has to guess. */
  description: string;
  /** The one thing it needs from the agent, if anything. */
  param?: { name: string; label: string; placeholder: string };
};

export const ACTIONS: ActionDef[] = [
  {
    id: "create_task",
    label: "Create a task for each",
    description: "One task per customer, in the queue you already work. Nothing is sent.",
    param: { name: "title", label: "Task", placeholder: "Call about next summer" },
  },
  {
    id: "add_tag",
    label: "Tag them all",
    description: "Adds a tag to every customer in this list, so you can find them again.",
    param: { name: "tag", label: "Tag", placeholder: "winter-sun" },
  },
  {
    id: "enrol_sequence",
    label: "Add to a sequence",
    description:
      "Starts a chase that stops the moment they reply. Sequences run in review mode unless you have turned auto-send on for that sequence.",
    param: { name: "sequenceId", label: "Sequence", placeholder: "Pick a sequence" },
  },
];

export const findAction = (id: string): ActionDef | undefined =>
  ACTIONS.find((a) => a.id === id);

/** A row Luna showed, reduced to what an action needs. */
export type ActionTarget = {
  /** Household id — every actionable tool returns households. */
  id: string;
  name: string;
};

export type ActionRequest = {
  action: ActionId;
  /** The ids the agent is acting on, taken from the rows on screen. */
  targetIds: string[];
  /** The action's one parameter, if it takes one. */
  value?: string;
};

export type ActionPlan = {
  action: ActionId;
  /** One line: exactly what will happen, and to how many. */
  summary: string;
  /** The people it will happen to, named — the first few plus a count. */
  who: string;
  targets: ActionTarget[];
  /** Anything the agent should know before agreeing. */
  notes: string[];
};

export type PlanResult = { ok: true; plan: ActionPlan } | { ok: false; error: string };

const HOUSEHOLD_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A tag we are willing to write: short, plain, no punctuation games. */
export function cleanTag(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9 &-]/g, "")
    .replace(/\s+/g, " ")
    .slice(0, 40)
    .trim();
}

/** Names for the confirmation line: enough to recognise, not a wall. */
export function nameList(targets: ActionTarget[]): string {
  const names = targets.map((t) => t.name).filter(Boolean);
  if (names.length === 0) return "no one";
  if (names.length <= 3) return names.join(", ");
  return `${names.slice(0, 3).join(", ")} and ${names.length - 3} more`;
}

/**
 * Turn a request plus the rows on screen into a plan the agent can agree to,
 * or a refusal that says why. Nothing here writes anything.
 */
export function planAction(
  request: ActionRequest,
  rows: ActionTarget[],
  context: { sequenceName?: string | null } = {}
): PlanResult {
  const def = findAction(request.action);
  if (!def) return { ok: false, error: "Luna doesn't know how to do that." };

  // Only ids that were actually on screen. A client sending an id Luna never
  // showed gets nothing — the rows are the authority, not the request.
  const byId = new Map(rows.map((r) => [r.id, r]));
  const targets = request.targetIds
    .filter((id) => HOUSEHOLD_ID.test(id))
    .map((id) => byId.get(id))
    .filter((t): t is ActionTarget => Boolean(t));

  if (targets.length === 0) {
    return { ok: false, error: "There's nobody in that list to act on." };
  }
  if (targets.length > MAX_TARGETS) {
    return {
      ok: false,
      error: `That would touch ${targets.length} customers. ${MAX_TARGETS} is the most Luna will do at once — narrow the question down first.`,
    };
  }

  const count = targets.length;
  const plural = count === 1 ? "" : "s";
  const notes: string[] = [];

  switch (request.action) {
    case "create_task": {
      const title = (request.value ?? "").trim();
      if (title.length < 3) {
        return { ok: false, error: "Give the task a title first." };
      }
      if (title.length > 120) {
        return { ok: false, error: "That task title is too long — keep it to a line." };
      }
      notes.push("Tasks land in your queue. Nothing is sent to anyone.");
      return {
        ok: true,
        plan: {
          action: request.action,
          summary: `Create ${count} task${plural}: "${title}"`,
          who: nameList(targets),
          targets,
          notes,
        },
      };
    }

    case "add_tag": {
      const tag = cleanTag(request.value ?? "");
      if (tag.length < 2) {
        return { ok: false, error: "That tag is too short to be useful." };
      }
      notes.push("Tagging changes nothing the customer can see.");
      return {
        ok: true,
        plan: {
          action: request.action,
          summary: `Tag ${count} customer${plural} as "${tag}"`,
          who: nameList(targets),
          targets,
          notes,
        },
      };
    }

    case "enrol_sequence": {
      const sequenceId = (request.value ?? "").trim();
      if (!HOUSEHOLD_ID.test(sequenceId)) {
        return { ok: false, error: "Pick a sequence first." };
      }
      const name = context.sequenceName?.trim();
      if (!name) {
        return { ok: false, error: "That sequence isn't one of yours." };
      }
      // The one action that could eventually put words in front of a
      // customer, so it says so plainly rather than in a tooltip.
      notes.push(
        "A sequence stops on its own the moment someone replies.",
        "If that sequence has auto-send switched on, its steps will go out without another check. Otherwise each one arrives in your task queue to approve."
      );
      return {
        ok: true,
        plan: {
          action: request.action,
          summary: `Add ${count} customer${plural} to "${name}"`,
          who: nameList(targets),
          targets,
          notes,
        },
      };
    }
  }
}

export type ActionOutcome = {
  action: ActionId;
  /** How many records were actually written. */
  done: number;
  /** Records skipped because they were already in that state. */
  skipped: number;
  /** What happened, in the words an agent would use. */
  summary: string;
};

/** The sentence shown after it has run. Counts what happened, never rounds up. */
export function describeOutcome(
  action: ActionId,
  done: number,
  skipped: number,
  label: string
): string {
  if (done === 0 && skipped > 0) {
    return `Nothing to do — all ${skipped} were already there.`;
  }
  if (done === 0) return "Nothing was changed.";

  const base =
    action === "create_task"
      ? `Created ${done} task${done === 1 ? "" : "s"}: "${label}"`
      : action === "add_tag"
        ? `Tagged ${done} customer${done === 1 ? "" : "s"} as "${label}"`
        : `Added ${done} customer${done === 1 ? "" : "s"} to "${label}"`;

  return skipped > 0 ? `${base}. ${skipped} were already there.` : `${base}.`;
}
