import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createClient as createRawClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import type { Database } from "./types";
import { mintTenantToken, tenantTokenConfigured } from "./tenant-token";

/**
 * The tenant-scoped client. Every page, route and lib uses this.
 *
 * Each outgoing request carries a freshly minted JWT naming the agency
 * resolved from the caller's session, so row-level security can enforce the
 * tenant boundary in the database. The token is attached by wrapping fetch
 * rather than by threading it through 46 files — and because it's resolved
 * at call time, one client can safely serve the whole request.
 *
 * When SUPABASE_JWT_SECRET is unset, nothing is attached and this behaves
 * exactly as it always has (the anon key, no claims). That keeps the code
 * shippable before the secret and the policies are in place.
 *
 * Fails closed: if the session can't be resolved we attach no token, so once
 * policies are live the query returns nothing rather than everything.
 */
export function createClient() {
  const cookieStore = cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { fetch: tenantFetch },
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(
          cookiesToSet: { name: string; value: string; options?: CookieOptions }[]
        ) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Server Components can't set cookies — safe to ignore in this MVP
          }
        },
      },
    }
  );
}

/**
 * Attach the tenant token to each PostgREST call.
 *
 * The import is deliberately lazy and inside the function: lib/auth/session
 * imports this module, so resolving it at module load would be circular.
 */
async function tenantFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const secret = process.env.SUPABASE_JWT_SECRET;
  if (!secret) return fetch(input, init);

  let token: string | null = null;
  try {
    const { currentAgencyIdQuiet } = await import("@/lib/auth/session");
    const agencyId = await currentAgencyIdQuiet();
    if (agencyId) token = mintTenantToken(agencyId, secret);
  } catch {
    token = null; // fail closed — no token means no rows once RLS is on
  }

  if (!token) return fetch(input, init);

  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${token}`);
  return fetch(input, { ...init, headers });
}

/**
 * The system client — for the few reads that legitimately span tenants, and
 * must not depend on a session:
 *
 *   - resolving which agency a Control client maps to (the lookup that
 *     ANSWERS "who is this request?", so it cannot ask that question first
 *     without looping),
 *   - the email webhook, called by a provider with no session at all.
 *
 * Uses the service-role key when present, which bypasses RLS by design.
 * That key is server-only and must never reach the browser. Without it this
 * falls back to the anon key, which is correct today and becomes
 * insufficient the moment policies are enabled — hence the deploy note.
 */
export function createSystemClient() {
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createRawClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** True when database-level tenant enforcement is switched on. */
export function rlsReady(): boolean {
  return tenantTokenConfigured() && Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
}

/**
 * The single-tenant fallback agency.
 *
 * Do NOT reach for this in pages, routes or libs — the tenant is a property
 * of the REQUEST, not of the deployment, so read it from the session instead
 * (`requireAgencyId()` in pages, `apiAgencyId()` in API routes). This constant
 * exists for exactly one caller: lib/auth/session, which returns it when
 * Control isn't configured and the app is running as a single-agency demo.
 */
export const AGENCY_ID = process.env.NEXT_PUBLIC_AGENCY_ID!;
