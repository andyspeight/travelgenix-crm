/**
 * A Supabase client for the portal.
 *
 * The portal reaches the database with the service-role key, exactly like the
 * rest of the server (lib/supabase/server) — NOTHING talks to Supabase from a
 * traveller's browser. The tenant + household boundary is therefore held by
 * the explicit `.eq("agency_id", …).eq("household_id", …)` filters that EVERY
 * portal query carries (see lib/portal/data), scoped to the household named in
 * the verified session cookie.
 *
 * It is deliberately untyped (`SupabaseClient`, not `<Database>`): the portal
 * touches `portal_login_tokens`, which is not in the generated types, and
 * keeping the portal's data access in one small, audited module is clearer
 * than widening the generated schema for one table.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export function createPortalClient(): SupabaseClient {
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
