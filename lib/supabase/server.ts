import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "./types";

export function createClient() {
  const cookieStore = cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
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
 * The single-tenant fallback agency.
 *
 * Do NOT reach for this in pages, routes or libs — the tenant is a property
 * of the REQUEST, not of the deployment, so read it from the session instead
 * (`requireAgencyId()` in pages, `apiAgencyId()` in API routes). This constant
 * exists for exactly one caller: lib/auth/session, which returns it when
 * Control isn't configured and the app is running as a single-agency demo.
 */
export const AGENCY_ID = process.env.NEXT_PUBLIC_AGENCY_ID!;
