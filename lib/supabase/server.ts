import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createClient as createRawClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import type { Database } from "./types";
import { mintTenantToken, tenantTokenConfigured } from "./tenant-token";

/**
 * The server's database client. Every page, route and lib uses this.
 *
 * NOTHING in this app talks to Supabase from the browser — client components
 * import types only — so the database is reached exclusively from the server.
 * That lets us use the SERVICE-ROLE key here and deny the published anon key
 * everything at the database, which is what actually closes the hole: the key
 * in the page source stops being a way in.
 *
 * TWO MODES, strongest first:
 *
 *   SERVICE ROLE (SUPABASE_SERVICE_ROLE_KEY) — bypasses RLS by design, so the
 *   tenant boundary is held by the per-request agency filters every query
 *   already carries (see lib/auth/session), backed by the static check in
 *   lib/supabase/tenant-filters.test.ts that fails the build if a query on a
 *   tenant table forgets its filter.
 *
 *   TENANT TOKEN (SUPABASE_JWT_SECRET) — the stronger mode, where each request
 *   carries a signed JWT naming its agency and RLS enforces the boundary in
 *   the database itself. It needs a SHARED (HS256) signing secret, which this
 *   project no longer uses: it has moved to asymmetric signing keys, whose
 *   private half Supabase does not expose. Kept because it costs nothing and
 *   becomes available again if a shared secret is ever reinstated.
 *
 * Neither set = the anon key, exactly as today.
 */
export function createClient() {
  const cookieStore = cookies();
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    key,
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
