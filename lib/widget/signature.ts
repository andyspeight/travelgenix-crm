/**
 * Signed-webhook verification for the widget lead ingest.
 *
 * Matches the scheme the tg-widgets suite already signs its outbound webhooks
 * with, so the CRM verifies exactly what the widget sends:
 *
 *   Header: X-Travelgenix-Signature: t={unix-seconds},v1={hex hmac}
 *   hmac  = HMAC-SHA256(secret, `${t}.${rawBody}`)
 *
 * Verify recomputes the HMAC, compares in constant time, and rejects anything
 * older than the tolerance window (replay protection). Pure given its inputs,
 * so it's fully testable.
 */

import crypto from "crypto";

/** The hex HMAC over `${timestamp}.${rawBody}`. */
export function signPayload(secret: string, timestamp: number, rawBody: string): string {
  return crypto.createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
}

/** Build the header value a sender would send (used in tests and by the widget). */
export function buildSignatureHeader(secret: string, rawBody: string, now: Date = new Date()): string {
  const t = Math.floor(now.getTime() / 1000);
  return `t=${t},v1=${signPayload(secret, t, rawBody)}`;
}

export type VerifyResult = { ok: true } | { ok: false; reason: string };

export function verifySignature(args: {
  header: string | null | undefined;
  rawBody: string;
  secret: string;
  now?: Date;
  toleranceSec?: number;
}): VerifyResult {
  const { header, rawBody, secret } = args;
  const nowSec = Math.floor((args.now ?? new Date()).getTime() / 1000);
  const tolerance = args.toleranceSec ?? 300;

  if (!header) return { ok: false, reason: "missing signature" };
  if (!secret) return { ok: false, reason: "no secret configured" };

  const parts: Record<string, string> = {};
  for (const kv of header.split(",")) {
    const [k, ...rest] = kv.trim().split("=");
    if (k) parts[k] = rest.join("=");
  }
  const t = Number(parts.t);
  const v1 = parts.v1;
  if (!Number.isFinite(t) || !v1) return { ok: false, reason: "malformed signature" };

  if (Math.abs(nowSec - t) > tolerance) return { ok: false, reason: "expired signature" };

  const expected = signPayload(secret, t, rawBody);
  const a = Buffer.from(v1, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length === 0 || a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { ok: false, reason: "bad signature" };
  }
  return { ok: true };
}
