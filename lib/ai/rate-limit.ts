/**
 * Rate limiting for the AI routes — every route that spends Anthropic tokens
 * goes through here.
 *
 * Two tiers, chosen at runtime:
 *
 *   DISTRIBUTED (production-grade): when UPSTASH_REDIS_REST_URL and
 *   UPSTASH_REDIS_REST_TOKEN are set, the window lives in Upstash Redis via
 *   its REST API — one hard limit across every serverless instance. INCR +
 *   PEXPIRE(NX) in a single pipeline; no SDK dependency.
 *
 *   LOCAL (fallback): the original fixed-window Map, per instance. Still the
 *   guard against runaway loops and single-client hammering; the honest
 *   caveat is the effective limit is (limit × warm instances).
 *
 *   If Upstash is configured but unreachable, we fall back to the local
 *   window for that call rather than letting the request through unmetered —
 *   an outage of the limiter must not become an open tap.
 *
 * Call sites use `await enforceRateLimit(...)` and honour the result.
 */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export type RateResult = { ok: true } | { ok: false; retryAfter: number };

/**
 * LOCAL tier: allow up to `limit` calls per `windowMs` for a key on this
 * instance. Exported for tests and used as the fallback tier.
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

/**
 * The limiter the routes call. Distributed when Upstash is configured,
 * local otherwise; never throws.
 */
export async function enforceRateLimit(
  key: string,
  limit: number,
  windowMs: number
): Promise<RateResult> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    return rateLimit(key, limit, windowMs);
  }

  try {
    const res = await fetch(`${url.replace(/\/$/, "")}/pipeline`, {
      method: "POST",
      signal: AbortSignal.timeout(2000),
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify([
        ["INCR", `rl:${key}`],
        ["PEXPIRE", `rl:${key}`, String(windowMs), "NX"],
        ["PTTL", `rl:${key}`],
      ]),
    });
    if (!res.ok) throw new Error(`Upstash ${res.status}`);

    const results = (await res.json()) as { result?: unknown; error?: string }[];
    const count = Number(results?.[0]?.result);
    const ttlMs = Number(results?.[2]?.result);
    if (!Number.isFinite(count)) throw new Error("Upstash: unexpected pipeline shape");

    if (count > limit) {
      const retryAfter =
        Number.isFinite(ttlMs) && ttlMs > 0
          ? Math.max(1, Math.ceil(ttlMs / 1000))
          : Math.ceil(windowMs / 1000);
      return { ok: false, retryAfter };
    }
    return { ok: true };
  } catch (err) {
    // Limiter outage must not become an open tap: fall back to the local window.
    console.error("[rate-limit] Upstash unavailable, using local window:", err);
    return rateLimit(key, limit, windowMs);
  }
}

/**
 * The client IP, preferring headers the platform sets and a client CANNOT
 * spoof. `x-forwarded-for` is client-supplied — an attacker can prepend a
 * random left-most entry to rotate their rate-limit key and defeat the limit —
 * so it is the last resort, used only when nothing trusted is present (local
 * dev). On Vercel, `x-vercel-forwarded-for` is set by the platform to the real
 * client IP and overrides any client value.
 */
function clientIpFrom(get: (name: string) => string | null): string {
  const trusted = get("x-vercel-forwarded-for") || get("x-real-ip");
  if (trusted) return trusted.split(",")[0]!.trim();
  const fwd = get("x-forwarded-for") ?? "";
  return fwd.split(",")[0]?.trim() || "anon";
}

/** Derive a per-client key from the request, scoped to a route. */
export function clientKey(request: Request, route: string): string {
  return `${route}:${clientIpFrom((n) => request.headers.get(n))}`;
}

/** Same derivation from a headers list (for Server Components). */
export function clientKeyFromHeaders(h: Headers, route: string): string {
  return `${route}:${clientIpFrom((n) => h.get(n))}`;
}

function prune(now: number) {
  for (const [k, v] of buckets) {
    if (now >= v.resetAt) buckets.delete(k);
  }
}
