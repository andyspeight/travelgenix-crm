/**
 * Magic-link login tokens.
 *
 * A login link carries a high-entropy random token. We store only its SHA-256
 * hash (with the household/contact it grants and a short expiry), so the raw
 * value lives only in the email — a leaked database row cannot be replayed.
 * Consuming a token is a single atomic update: it succeeds only while the row
 * is unused and unexpired, and the same update marks it used, so a link works
 * exactly once even under a double-click or a race.
 *
 * Node-only (uses node:crypto); called from the portal API routes.
 */

import { createHash, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Links are usable for 30 minutes — long enough for a real inbox delay. */
export const LOGIN_TOKEN_TTL_MS = 30 * 60_000;

function hashToken(raw: string): string {
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

export type LoginGrant = {
  agencyId: string;
  householdId: string;
  contactId: string;
  email: string;
};

/**
 * Create a login token for a grant and store its hash. Returns the RAW token
 * to put in the email link (never persisted).
 */
export async function createLoginToken(
  supabase: SupabaseClient,
  grant: LoginGrant,
  now: number = Date.now()
): Promise<string> {
  const raw = randomBytes(32).toString("hex"); // 256 bits
  await supabase.from("portal_login_tokens").insert({
    token_hash: hashToken(raw),
    agency_id: grant.agencyId,
    household_id: grant.householdId,
    contact_id: grant.contactId,
    email: grant.email,
    expires_at: new Date(now + LOGIN_TOKEN_TTL_MS).toISOString(),
  });
  return raw;
}

/**
 * Consume a login token: valid only while unused and unexpired, and marked
 * used in the same write. Returns the grant, or null.
 */
export async function consumeLoginToken(
  supabase: SupabaseClient,
  raw: string,
  now: number = Date.now()
): Promise<LoginGrant | null> {
  if (!raw || !/^[0-9a-f]{64}$/.test(raw)) return null;
  const { data } = await supabase
    .from("portal_login_tokens")
    .update({ used_at: new Date(now).toISOString() })
    .eq("token_hash", hashToken(raw))
    .is("used_at", null)
    .gt("expires_at", new Date(now).toISOString())
    .select("agency_id, household_id, contact_id, email")
    .maybeSingle();
  if (!data) return null;
  return {
    agencyId: data.agency_id as string,
    householdId: data.household_id as string,
    contactId: data.contact_id as string,
    email: data.email as string,
  };
}
