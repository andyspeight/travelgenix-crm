/**
 * Best-effort rate limiter for the AI routes.
 *
 * A fixed-window counter held in module memory. This is deliberately simple and
 * has one honest caveat: on serverless it is per-instance, so the effective
 * limit is (configured limit x warm instances). That is fine as a guard against
 * a runaway loop or an accidental hammer from a single client, which is all we
 * need while the app is internal. For a hard, distributed limit before any
 * client-facing use, swap the Map for Upstash Redis. The call sites do not
 * change: they just call rateLimit() and honour the result.
 */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export type RateResult = { ok: true } | { ok: false; retryAfter: number };

/**
 * Allow up to `limit` calls per `windowMs` for a given key. Returns ok, or the
 * seconds to wait when the window is exhausted.
 */
export function rateLimit(key: string, limit: number, windowMs: number): RateResult {
  const now = Date.now();
  const b = buckets.get(key);

  if (!b || now >= b.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    if (buckets.size > 5000) prune(now); // bound memory on a hot instance
    return { ok: true };
  }

  if (b.count >= limit) {
    return { ok: false, retryAfter: Math.max(1, Math.ceil((b.resetAt - now) / 1000)) };
  }

  b.count++;
  return { ok: true };
}

/** Derive a per-client key from the request, scoped to a route. */
export function clientKey(request: Request, route: string): string {
  const fwd = request.headers.get("x-forwarded-for") ?? "";
  const ip = fwd.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "anon";
  return `${route}:${ip}`;
}

function prune(now: number) {
  for (const [k, v] of buckets) {
    if (now >= v.resetAt) buckets.delete(k);
  }
}
