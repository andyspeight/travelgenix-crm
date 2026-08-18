/**
 * Security-event logging — the "someone is knocking and getting it wrong" trail.
 *
 * One greppable channel for the events a reviewer or an alert wants to see:
 * rejected credentials, secret mismatches, refused access. Everything goes out
 * as a single structured `[security]` line on stderr, which Vercel retains and
 * can alert on (e.g. a spike in `*.rejected` pages someone).
 *
 * This is deliberately NOT the business event spine (lib/events) and NOT the
 * per-record PII access audit log (tracked separately as P1). It never records
 * the secret, the supplied credential, or PII — only the fact, the route and a
 * coarse client hint, so the log itself is safe to retain and read.
 */

export type SecurityEventKind =
  | "auth.access.rejected"
  | "webhook.token.rejected"
  | "inbound.token.rejected"
  | "cron.token.rejected"
  | "csp.violation";

export function logSecurityEvent(
  kind: SecurityEventKind,
  detail: { route: string; ip?: string | null; note?: string }
): void {
  const line = {
    tag: "security",
    kind,
    route: detail.route,
    ip: detail.ip || undefined,
    note: detail.note,
    at: new Date().toISOString(),
  };
  // warn, not log: it should stand out from info traffic and is retained.
  console.warn(`[security] ${JSON.stringify(line)}`);
}

/** Best-effort client IP from the proxy header, for the log line only. */
export function clientIp(request: Request): string | null {
  const xff = request.headers.get("x-forwarded-for");
  return xff ? xff.split(",")[0]!.trim() : null;
}
