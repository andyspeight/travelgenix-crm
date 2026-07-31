/**
 * Sequences — deciding, for one enrolment, what should happen next.
 *
 * A journey fires once. A sequence keeps going over days, which is how a
 * quote actually gets chased. That inverts where the care goes: the hard part
 * is not sending on day 3, it is being certain we do NOT send on day 3 when
 * the customer replied on day 2.
 *
 * So this checks every stop condition BEFORE it considers sending, on every
 * evaluation, not only when a step happens to be due. Otherwise a reply on
 * day 2 would sit unnoticed until day 3's send was already being prepared —
 * and the customer would get a chase for something they had already answered.
 *
 * Stop conditions are all deterministic facts read from real rows:
 *
 *   they replied           — any inbound message since we enrolled them
 *   the thing resolved     — the quote was accepted or declined, the enquiry
 *                            converted or closed. There is nothing left to chase.
 *   we cannot reach them   — the address bounced or they reported us as spam
 *   consent withdrawn      — for marketing sequences only; a reply-chase on a
 *                            live booking is service, not marketing
 *   stopped by hand        — an agent decided, and that outranks everything
 *
 * Pure function, no I/O, so every one of those rules is testable without a
 * database.
 */

export type SequenceStep = {
  stepNumber: number;
  /** Days from ENROLMENT, not from the previous step. */
  delayDays: number;
  subject: string;
  body: string;
};

export type Enrolment = {
  enrolledAt: string;
  stepsSent: number;
  lastSentAt: string | null;
  status: "active" | "completed" | "stopped";
};

/** Facts about the subject, gathered when the runner loads its data. */
export type StopSignals = {
  /** Any inbound contact from this household since enrolment. */
  repliedAt?: string | null;
  /** The quote/enquiry/trip this chase was about has been resolved. */
  resolved?: { at: string; what: string } | null;
  /** The address bounced or complained — we literally cannot reach them. */
  undeliverable?: boolean;
  /** Marketing consent withdrawn. Only consulted for marketing sequences. */
  consentWithdrawn?: boolean;
  /** An agent pressed stop. */
  stoppedByHand?: boolean;
};

export type SequenceDecision =
  | { action: "stop"; reason: string }
  | { action: "complete"; reason: string }
  | { action: "send"; step: SequenceStep }
  | { action: "wait"; reason: string };

export type DecideInput = {
  enrolment: Enrolment;
  steps: SequenceStep[];
  signals: StopSignals;
  /** Marketing sequences answer to consent; operational ones do not. */
  purpose: "operational" | "marketing";
  now: Date;
};

const daysBetween = (fromIso: string, now: Date): number =>
  (now.getTime() - new Date(fromIso).getTime()) / 86_400_000;

/**
 * The one decision. Order is deliberate and load-bearing: stop reasons are
 * evaluated first and in order of how badly we want to honour them.
 */
export function decideNext(input: DecideInput): SequenceDecision {
  const { enrolment, steps, signals, purpose, now } = input;

  // Already finished — nothing to decide.
  if (enrolment.status !== "active") {
    return { action: "wait", reason: `Enrolment is ${enrolment.status}.` };
  }

  // ─── Stop conditions, before anything else ────────────────────────────

  // A person's explicit decision outranks every rule below it.
  if (signals.stoppedByHand) {
    return { action: "stop", reason: "Stopped by an agent." };
  }

  // The whole point. If they have answered, the chase is over — whether or
  // not the next step happens to be due.
  if (signals.repliedAt) {
    return { action: "stop", reason: "They replied, so the chase stopped." };
  }

  // Chasing someone about a quote they already accepted is worse than not
  // chasing at all.
  if (signals.resolved) {
    return { action: "stop", reason: `No longer needed — ${signals.resolved.what}.` };
  }

  // Sending again would just generate another bounce and damage the domain.
  if (signals.undeliverable) {
    return {
      action: "stop",
      reason: "Their email address is not reachable, so nothing more was sent.",
    };
  }

  // Consent applies to marketing. A reply-chase on a live booking is service
  // under PECR, and stopping it on a marketing withdrawal would be wrong.
  if (purpose === "marketing" && signals.consentWithdrawn) {
    return { action: "stop", reason: "They withdrew marketing consent." };
  }

  // ─── Nothing stopped it. Is a step due? ───────────────────────────────

  const ordered = [...steps].sort((a, b) => a.stepNumber - b.stepNumber);
  if (ordered.length === 0) {
    return { action: "complete", reason: "This sequence has no steps." };
  }

  if (enrolment.stepsSent >= ordered.length) {
    return { action: "complete", reason: "Every step has been sent." };
  }

  const next = ordered[enrolment.stepsSent];
  const elapsed = daysBetween(enrolment.enrolledAt, now);

  if (elapsed + 1e-9 < next.delayDays) {
    const remaining = Math.max(0, Math.ceil(next.delayDays - elapsed));
    return {
      action: "wait",
      reason: `Step ${next.stepNumber} is due in ${remaining} day${remaining === 1 ? "" : "s"}.`,
    };
  }

  // Never two steps in one day, even if a run was missed and several are
  // technically overdue. Catching up all at once would arrive as a burst.
  if (enrolment.lastSentAt && daysBetween(enrolment.lastSentAt, now) < 1) {
    return { action: "wait", reason: "Something was already sent today." };
  }

  return { action: "send", step: next };
}
