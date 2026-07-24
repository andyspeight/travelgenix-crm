/**
 * The access gate — signed-cookie session for the single-workspace app.
 *
 * Not multi-tenant auth (that milestone needs Supabase Auth + RLS); this is
 * the lock on the front door so the live deployment isn't writable by anyone
 * who finds the URL. One shared access code (LUNA_ACCESS_CODE env var)
 * unlocks the app; possession is proven afterwards by an HMAC-signed,
 * expiring token in an httpOnly cookie, so the code itself is never stored
 * client-side.
 *
 * Web Crypto only (no Node 'crypto' import) so the same helpers run in the
 * edge middleware and the Node route. Pure except for crypto.subtle.
 */

export const ACCESS_COOKIE = "luna_access";
export const ACCESS_TTL_MS = 30 * 24 * 3600_000; // 30 days

const enc = new TextEncoder();

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Constant-time-ish string comparison (length leak only). */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Mint a token: "<expiryMs>.<hmac(expiryMs)>". */
export async function signAccessToken(
  secret: string,
  now: number = Date.now(),
  ttlMs: number = ACCESS_TTL_MS
): Promise<string> {
  const exp = String(now + ttlMs);
  return `${exp}.${await hmacHex(secret, exp)}`;
}

/** True only for an untampered token that hasn't expired. */
export async function verifyAccessToken(
  secret: string,
  token: string | undefined | null,
  now: number = Date.now()
): Promise<boolean> {
  if (!token) return false;
  const dot = token.indexOf(".");
  if (dot <= 0) return false;
  const exp = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!/^\d{10,16}$/.test(exp) || Number(exp) <= now) return false;
  const expected = await hmacHex(secret, exp);
  return safeEqual(sig, expected);
}
