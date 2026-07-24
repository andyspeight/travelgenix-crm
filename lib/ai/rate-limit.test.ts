import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { rateLimit, enforceRateLimit, clientKeyFromHeaders } from "@/lib/ai/rate-limit";

describe("rateLimit (local window)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-24T12:00:00.000Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("allows up to the limit then refuses with a retry-after", () => {
    const key = `t-${Math.random()}`;
    expect(rateLimit(key, 2, 60_000).ok).toBe(true);
    expect(rateLimit(key, 2, 60_000).ok).toBe(true);
    const third = rateLimit(key, 2, 60_000);
    expect(third.ok).toBe(false);
    if (!third.ok) expect(third.retryAfter).toBeGreaterThan(0);
  });

  it("resets after the window", () => {
    const key = `t-${Math.random()}`;
    rateLimit(key, 1, 60_000);
    expect(rateLimit(key, 1, 60_000).ok).toBe(false);
    vi.advanceTimersByTime(61_000);
    expect(rateLimit(key, 1, 60_000).ok).toBe(true);
  });

  it("keys are independent", () => {
    const a = `a-${Math.random()}`;
    const b = `b-${Math.random()}`;
    rateLimit(a, 1, 60_000);
    expect(rateLimit(a, 1, 60_000).ok).toBe(false);
    expect(rateLimit(b, 1, 60_000).ok).toBe(true);
  });
});

describe("enforceRateLimit (distributed tier)", () => {
  const env = process.env;
  afterEach(() => {
    process.env = env;
    vi.unstubAllGlobals();
  });

  it("uses the local window when Upstash isn't configured", async () => {
    process.env = { ...env };
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    const key = `local-${Math.random()}`;
    expect((await enforceRateLimit(key, 1, 60_000)).ok).toBe(true);
    expect((await enforceRateLimit(key, 1, 60_000)).ok).toBe(false);
  });

  it("refuses when the Redis counter is over the limit, with TTL as retry-after", async () => {
    process.env = { ...env, UPSTASH_REDIS_REST_URL: "https://fake.upstash.io", UPSTASH_REDIS_REST_TOKEN: "t" };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify([{ result: 11 }, { result: 1 }, { result: 42_000 }]), { status: 200 })
      )
    );
    const r = await enforceRateLimit(`up-${Math.random()}`, 10, 60_000);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.retryAfter).toBe(42);
  });

  it("allows when the counter is within the limit", async () => {
    process.env = { ...env, UPSTASH_REDIS_REST_URL: "https://fake.upstash.io", UPSTASH_REDIS_REST_TOKEN: "t" };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify([{ result: 3 }, { result: 1 }, { result: 42_000 }]), { status: 200 })
      )
    );
    expect((await enforceRateLimit(`up-${Math.random()}`, 10, 60_000)).ok).toBe(true);
  });

  it("an Upstash outage falls back to the local window, never an open tap", async () => {
    process.env = { ...env, UPSTASH_REDIS_REST_URL: "https://fake.upstash.io", UPSTASH_REDIS_REST_TOKEN: "t" };
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network down"); }));
    const key = `down-${Math.random()}`;
    expect((await enforceRateLimit(key, 1, 60_000)).ok).toBe(true);
    // Second call still metered by the local fallback.
    expect((await enforceRateLimit(key, 1, 60_000)).ok).toBe(false);
  });
});

describe("clientKeyFromHeaders", () => {
  it("prefers the first forwarded IP and scopes by route", () => {
    const h = new Headers({ "x-forwarded-for": "1.2.3.4, 10.0.0.1" });
    expect(clientKeyFromHeaders(h, "brief")).toBe("brief:1.2.3.4");
    expect(clientKeyFromHeaders(new Headers(), "brief")).toBe("brief:anon");
  });
});
