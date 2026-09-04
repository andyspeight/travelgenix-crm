/**
 * The traveller's portal session — a signed, expiring cookie.
 *
 * Deliberately SEPARATE from the agency-staff sign-in (Control / the access
 * gate): a customer is not a staff user and must never touch agency tooling.
 * The cookie carries only what a portal request needs — the agency, the
 * household and the contact — HMAC-signed with PORTAL_SESSION_SECRET so it
 * can't be forged, and stamped with an expiry so a stolen cookie dies.
 *
 * The secret doubles as the FEATURE FLAG: with no PORTAL_SESSION_SECRET set,
 * portalEnabled() is false and every portal surface is closed. So the portal
 * ships dark and is switched on by setting one env var, once reviewed.
 *
 * Web Crypto only (same as lib/auth/gate), so the helpers are edge- and
 * node-safe. The cookie read + page guard live in lib/portal/require (they
 * pull in next/headers), keeping this module pure and unit-testable.
 */

export const PORTAL_COOKIE = "tg_portal";
export const PORTAL_TTL_MS = 30 * 24 * 3600_000; // 30 days

export type PortalSession = {
  agencyId: string;
  householdId: string;
  contactId: string;
};

type Payload = PortalSession & { exp: number };

const enc = new TextEncoder();

/** Portal is live only when its signing secret is configured. */
export function portalEnabled(): boolean {
  return Boolean(process.env.PORTAL_SESSION_SECRET);
}

function secret(): string {
  return process.env.PORTAL_SESSION_SECRET || "";
}

function b64urlEncode(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(str: string): Uint8Array {
  const s = str.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmacHex(message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Constant-time-ish string comparison (length leak only, on a hex digest). */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Mint a signed session token: "<payloadB64url>.<hmac>". */
export async function signPortalSession(
  session: PortalSession,
  now: number = Date.now(),
  ttlMs: number = PORTAL_TTL_MS
): Promise<string> {
  const payload: Payload = { ...session, exp: now + ttlMs };
  const body = b64urlEncode(enc.encode(JSON.stringify(payload)));
  return `${body}.${await hmacHex(body)}`;
}

/** Verify a token and return its session, or null if tampered/expired. */
export async function verifyPortalSession(
  token: string | undefined | null,
  now: number = Date.now()
): Promise<PortalSession | null> {
  if (!token || !secret()) return null;
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!safeEqual(sig, await hmacHex(body))) return null;
  try {
    const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(body))) as Payload;
    if (typeof payload.exp !== "number" || payload.exp <= now) return null;
    if (!payload.agencyId || !payload.householdId || !payload.contactId) return null;
    return {
      agencyId: payload.agencyId,
      householdId: payload.householdId,
      contactId: payload.contactId,
    };
  } catch {
    return null;
  }
}
