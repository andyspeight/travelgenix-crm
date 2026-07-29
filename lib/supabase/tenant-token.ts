/**
 * The per-request tenant token — what makes RLS possible.
 *
 * The problem it solves: Luna Work talks to Supabase with the ANON key, and
 * that key ships to the browser. Without row-level security, anyone holding
 * it can read or write every row directly, and RLS can't help while every
 * request looks identical to Postgres — there is nothing in the connection
 * that says which agency is asking.
 *
 * So each request mints a short-lived Supabase-compatible JWT carrying the
 * agency resolved from the caller's Control session, signed with the
 * project's JWT secret. PostgREST verifies it and exposes the claims to
 * policies as `auth.jwt()`, so a policy can say "rows where agency_id
 * matches the token" — and a query that FORGETS its filter returns nothing
 * instead of someone else's customers. Application filters become defence in
 * depth rather than the only defence.
 *
 * Short expiry (60s) because the token is minted per request and never
 * stored: it exists for the round trip and nowhere else.
 *
 * Unset SUPABASE_JWT_SECRET = no token minted and the client behaves exactly
 * as it does today. That is deliberate: the code can ship before the secret
 * and the policies exist, and switching enforcement on is a config step, not
 * a deploy.
 */

import { createHmac } from "crypto";

const TTL_SECONDS = 60;

const b64url = (input: Buffer | string): string =>
  Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

export function tenantTokenConfigured(): boolean {
  return Boolean(process.env.SUPABASE_JWT_SECRET);
}

/**
 * Mint a Supabase-shaped JWT for one agency.
 *
 * `role` and `aud` are "authenticated" because that is the Postgres role
 * PostgREST switches to and the audience it checks; `agency_id` is our own
 * claim, and the only one the policies read.
 *
 * Exported (and pure apart from the clock) so the encoding is testable.
 */
export function mintTenantToken(
  agencyId: string,
  secret: string,
  nowMs: number = Date.now()
): string {
  const iat = Math.floor(nowMs / 1000);
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = b64url(
    JSON.stringify({
      role: "authenticated",
      aud: "authenticated",
      agency_id: agencyId,
      iat,
      exp: iat + TTL_SECONDS,
    })
  );
  const signature = b64url(
    createHmac("sha256", secret).update(`${header}.${payload}`).digest()
  );
  return `${header}.${payload}.${signature}`;
}

/** Decode a token's claims without verifying — for tests and diagnostics only. */
export function decodeClaims(token: string): Record<string, unknown> | null {
  const part = token.split(".")[1];
  if (!part) return null;
  try {
    return JSON.parse(Buffer.from(part, "base64").toString("utf8"));
  } catch {
    return null;
  }
}
