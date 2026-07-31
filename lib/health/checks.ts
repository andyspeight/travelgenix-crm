/**
 * System health — the questions worth asking about a running CRM, answered
 * from real rows rather than from hope.
 *
 * Vercel already tells us about crashes and error rates, so this is
 * deliberately not a log viewer. It covers the things that fail QUIETLY, where
 * nothing errors and nobody finds out:
 *
 *   the schedule stopped        — no reminders go out, no page breaks
 *   emails are failing to send  — the audit table fills with failures nobody reads
 *   addresses are bouncing      — customers silently unreachable
 *   a channel was never wired   — "why has nothing sent?" a week later
 *
 * Every check states what it looked at and what it means, in the same plain
 * language as the rest of the product. Pure functions, no I/O, so the
 * thresholds are testable.
 */

export type HealthState = "ok" | "warn" | "bad" | "off";

export type HealthCheck = {
  /** Stable key, e.g. "schedule". */
  id: string;
  label: string;
  state: HealthState;
  /** The short answer: "ran 4 hours ago", "3 in the last 7 days". */
  value: string;
  /** Why that matters, and what to do if it isn't ok. */
  detail: string;
};

export type HealthInputs = {
  now: Date;
  /** Most recent scheduled run, if there has ever been one. */
  lastCronRun: { startedAt: string; status: string; actions: number } | null;
  /** True when CRON_SECRET is set — without it the schedule cannot run at all. */
  cronEnabled: boolean;
  emailConfigured: boolean;
  /** Sends that failed at the provider in the last 7 days. */
  failedSends7d: number;
  /** Sends that were accepted then bounced, in the last 7 days. */
  bounced7d: number;
  /** Total sends in the last 7 days, for a rate rather than a bare count. */
  totalSends7d: number;
  /** Addresses currently suppressed. */
  suppressed: number;
  aiConfigured: boolean;
  controlConfigured: boolean;
};

const hoursSince = (iso: string, now: Date): number =>
  (now.getTime() - new Date(iso).getTime()) / 3_600_000;

const ago = (hours: number): string => {
  if (hours < 1) return "less than an hour ago";
  if (hours < 24) return `${Math.round(hours)} hours ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
};

/**
 * The schedule check. This is the one that matters most, because a stopped
 * schedule is invisible: journeys simply stop firing and the app looks fine.
 *
 * It runs daily, so more than ~26 hours without a run means it missed one.
 * Two days means it is genuinely not running.
 */
function scheduleCheck(i: HealthInputs): HealthCheck {
  if (!i.cronEnabled) {
    return {
      id: "schedule",
      label: "Nightly auto-pilot",
      state: "off",
      value: "not switched on",
      detail:
        "Journeys only run when someone presses Run now. Set CRON_SECRET in Vercel to have them run every night.",
    };
  }
  if (!i.lastCronRun) {
    return {
      id: "schedule",
      label: "Nightly auto-pilot",
      state: "warn",
      value: "never run",
      detail:
        "The schedule is switched on but has not run yet. If it is still saying this tomorrow, the cron is not reaching the app.",
    };
  }

  const hours = hoursSince(i.lastCronRun.startedAt, i.now);
  const failed = i.lastCronRun.status === "failed";
  const partial = i.lastCronRun.status === "partial";

  if (hours > 48) {
    return {
      id: "schedule",
      label: "Nightly auto-pilot",
      state: "bad",
      value: `last ran ${ago(hours)}`,
      detail:
        "It should run every night. Two days without one means reminders, rebooking nudges and follow-ups are not going out.",
    };
  }
  if (hours > 26 || failed || partial) {
    return {
      id: "schedule",
      label: "Nightly auto-pilot",
      state: "warn",
      value: failed
        ? "last run failed"
        : partial
          ? "last run partly failed"
          : `last ran ${ago(hours)}`,
      detail: failed
        ? "The run could not proceed at all. Check the logs for /api/cron/journeys."
        : partial
          ? "Some agencies were skipped because they errored. The rest ran normally."
          : "A run looks to have been missed. One is not a problem; a pattern is.",
    };
  }
  return {
    id: "schedule",
    label: "Nightly auto-pilot",
    state: "ok",
    value: `ran ${ago(hours)}`,
    detail: `Queued ${i.lastCronRun.actions} action${i.lastCronRun.actions === 1 ? "" : "s"} on its last run.`,
  };
}

/** Sends the provider refused outright — a real failure, not a bounce. */
function sendFailureCheck(i: HealthInputs): HealthCheck {
  if (!i.emailConfigured) {
    return {
      id: "sending",
      label: "Email sending",
      state: "off",
      value: "not configured",
      detail:
        "Send buttons open your own mail app instead. Set a provider key and EMAIL_FROM to send from the CRM.",
    };
  }
  if (i.failedSends7d === 0) {
    return {
      id: "sending",
      label: "Email sending",
      state: "ok",
      value:
        i.totalSends7d === 0
          ? "nothing sent this week"
          : `${i.totalSends7d} sent, none failed`,
      detail: "No sends were refused by the provider in the last 7 days.",
    };
  }
  // A handful against a large volume is noise; a handful against almost
  // nothing is a broken configuration.
  const rate = i.totalSends7d > 0 ? i.failedSends7d / i.totalSends7d : 1;
  return {
    id: "sending",
    label: "Email sending",
    state: rate > 0.2 ? "bad" : "warn",
    value: `${i.failedSends7d} failed of ${i.totalSends7d}`,
    detail:
      rate > 0.2
        ? "A large share of sends are being refused. Check the sender address is still verified with the provider."
        : "Some sends were refused by the provider. Worth a look if it keeps happening.",
  };
}

/** Accepted, then came back undelivered. */
function deliverabilityCheck(i: HealthInputs): HealthCheck {
  if (!i.emailConfigured) {
    return {
      id: "deliverability",
      label: "Deliverability",
      state: "off",
      value: "nothing to measure",
      detail: "No sending, so no bounces.",
    };
  }
  if (i.bounced7d === 0) {
    return {
      id: "deliverability",
      label: "Deliverability",
      state: "ok",
      value:
        i.suppressed === 0
          ? "no bounces"
          : `no recent bounces, ${i.suppressed} address${i.suppressed === 1 ? "" : "es"} blocked`,
      detail:
        "Blocked addresses have bounced or reported spam before and will not be written to again.",
    };
  }
  const rate = i.totalSends7d > 0 ? i.bounced7d / i.totalSends7d : 1;
  return {
    id: "deliverability",
    label: "Deliverability",
    state: rate > 0.05 ? "bad" : "warn",
    value: `${i.bounced7d} bounced of ${i.totalSends7d}`,
    detail:
      rate > 0.05
        ? "More than one in twenty is bouncing. That damages your sending reputation — the address data needs cleaning."
        : "Some addresses are dead. Luna raises each one on the dashboard so it can be corrected.",
  };
}

function configCheck(
  id: string,
  label: string,
  on: boolean,
  onDetail: string,
  offDetail: string
): HealthCheck {
  return {
    id,
    label,
    state: on ? "ok" : "off",
    value: on ? "configured" : "not configured",
    detail: on ? onDetail : offDetail,
  };
}

export function computeHealth(i: HealthInputs): HealthCheck[] {
  return [
    scheduleCheck(i),
    sendFailureCheck(i),
    deliverabilityCheck(i),
    configCheck(
      "ai",
      "Luna AI",
      i.aiConfigured,
      "Drafting, briefs and Ask Luna are live.",
      "AI features fall back to their deterministic versions. Nothing breaks; Luna just stops writing."
    ),
    configCheck(
      "signin",
      "Sign-in",
      i.controlConfigured,
      "The CRM requires a Travelgenix sign-in.",
      "Anyone with the address can open this CRM. Set CONTROL_BASE_URL to require a sign-in."
    ),
  ];
}

/** The worst state present — what a single overall indicator should show. */
export function overallState(checks: HealthCheck[]): HealthState {
  if (checks.some((c) => c.state === "bad")) return "bad";
  if (checks.some((c) => c.state === "warn")) return "warn";
  if (checks.some((c) => c.state === "off")) return "off";
  return "ok";
}
