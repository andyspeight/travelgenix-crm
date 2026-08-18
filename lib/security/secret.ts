/**
 * Constant-time secret comparison for the shared-secret routes.
 *
 * A plain `a !== b` (and even a length-short-circuiting loop) leaks how much of
 * a secret an attacker guessed right through response timing. Both sides are
 * SHA-256'd first so the comparison is ALWAYS over two 32-byte buffers: the
 * timing no longer depends on the input length or on where the first mismatch
 * falls, closing the side channel for bearer tokens, webhook tokens and the
 * access code alike.
 */

import { createHash, timingSafeEqual } from "crypto";

export function safeSecretEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a ?? "", "utf8").digest();
  const hb = createHash("sha256").update(b ?? "", "utf8").digest();
  return timingSafeEqual(ha, hb);
}

/** Pull the token out of an `Authorization: Bearer <token>` header, or "". */
export function bearerToken(header: string | null | undefined): string {
  if (!header) return "";
  const m = /^Bearer\s+(.+)$/i.exec(header.trim());
  return m ? m[1].trim() : "";
}
