/**
 * The first-response clock (blueprint §6: every enquiry has a first-response
 * target, a countdown and an escalation state).
 *
 * Pure functions, no I/O. The SLA is a fixed window from the moment the
 * enquiry was received; per-agency configurable SLAs come with Settings
 * persistence later. Working-hours awareness is deliberately out of scope for
 * v1 — a countdown that is simply honest about elapsed time beats a clever one
 * nobody can predict.
 */

/** Default first-response target: 4 hours from receipt. */
export const DEFAULT_SLA_HOURS = 4;

export type ClockState = "responded" | "ok" | "warning" | "overdue";

export type Clock = {
  state: ClockState;
  /** Milliseconds remaining until due (negative = past due). 0 when responded. */
  remainingMs: number;
  /** Short human label: "2h 10m left", "38m over", "responded in 1h 20m". */
  label: string;
};

/** Due timestamp for a newly received enquiry. */
export function responseDueAt(
  receivedAtIso: string,
  slaHours: number = DEFAULT_SLA_HOURS
): string {
  return new Date(
    new Date(receivedAtIso).getTime() + slaHours * 3600_000
  ).toISOString();
}

const short = (ms: number): string => {
  const totalMinutes = Math.max(1, Math.round(Math.abs(ms) / 60_000));
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  if (hours > 0) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  return `${minutes}m`;
};

/**
 * Where the clock stands right now. The warning band is the final quarter of
 * the SLA window (so a 4 hour target starts warning with an hour left).
 */
export function clockState(args: {
  receivedAt: string;
  dueAt: string | null;
  respondedAt: string | null;
  now?: string;
}): Clock {
  const nowMs = new Date(args.now ?? new Date().toISOString()).getTime();

  if (args.respondedAt) {
    const took =
      new Date(args.respondedAt).getTime() -
      new Date(args.receivedAt).getTime();
    return {
      state: "responded",
      remainingMs: 0,
      label: `responded in ${short(Math.max(0, took))}`,
    };
  }

  if (!args.dueAt) {
    // No clock set (legacy rows). Honest fallback: show age instead.
    const age = nowMs - new Date(args.receivedAt).getTime();
    return { state: "ok", remainingMs: 0, label: `waiting ${short(age)}` };
  }

  const dueMs = new Date(args.dueAt).getTime();
  const remainingMs = dueMs - nowMs;

  if (remainingMs < 0) {
    return { state: "overdue", remainingMs, label: `${short(remainingMs)} over` };
  }

  const window = dueMs - new Date(args.receivedAt).getTime();
  const warning = remainingMs <= Math.max(1, window) / 4;
  return {
    state: warning ? "warning" : "ok",
    remainingMs,
    label: `${short(remainingMs)} left`,
  };
}
