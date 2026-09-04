/**
 * The login lookup — the one portal query that spans agencies.
 *
 * When someone asks for a login link, we have only their email and no session,
 * so working out WHICH agency/household it belongs to is the whole job — the
 * lookup cannot be scoped by the agency it exists to find. It is deliberately
 * narrow (one email) and read-only, and the link that follows grants ONLY the
 * matched household. Every other portal query is household-scoped (lib/portal/data).
 *
 * Isolated in its own file so the tenant-filter guard's exemption covers this
 * cross-agency read and nothing else.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type EmailMatch = {
  agencyId: string;
  householdId: string;
  contactId: string;
  firstName: string;
  lastName: string | null;
  email: string;
};

/**
 * Every contact (across all agencies) whose email matches, case-insensitively.
 * Usually one; more than one means the person is a customer of more than one
 * agency on the platform, and each gets its own link.
 */
export async function findContactsByEmail(
  supabase: SupabaseClient,
  email: string
): Promise<EmailMatch[]> {
  const clean = email.trim().toLowerCase();
  if (!clean || !clean.includes("@")) return [];

  const { data } = await supabase
    .from("contacts")
    .select("id, agency_id, household_id, first_name, last_name, email")
    .ilike("email", clean)
    .limit(10);

  return ((data ?? []) as Record<string, unknown>[])
    .filter((c) => (c.email as string | null)?.toLowerCase() === clean)
    .map((c) => ({
      agencyId: c.agency_id as string,
      householdId: c.household_id as string,
      contactId: c.id as string,
      firstName: (c.first_name as string) ?? "",
      lastName: (c.last_name as string | null) ?? null,
      email: c.email as string,
    }));
}

export type AgencyMatch = {
  agencyId: string;
  slug: string;
  name: string;
  brandColor: string | null;
  logoUrl: string | null;
};

export const AGENCY_SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;

/**
 * The agency behind a branded portal URL (/portal/<slug>). Like the email
 * lookup this cannot be scoped by the agency it exists to find; it is a
 * single-row read by a unique slug and returns only what the login screen
 * shows (name, colour, logo).
 */
export async function findAgencyBySlug(
  supabase: SupabaseClient,
  slug: string
): Promise<AgencyMatch | null> {
  const clean = slug.trim().toLowerCase();
  if (!AGENCY_SLUG_RE.test(clean)) return null;

  const { data } = await supabase
    .from("agencies")
    .select("id, slug, name, brand_color, logo_url")
    .eq("slug", clean)
    .maybeSingle();
  if (!data) return null;
  return {
    agencyId: data.id as string,
    slug: data.slug as string,
    name: (data.name as string) || "Your travel agent",
    brandColor: (data.brand_color as string | null) ?? null,
    logoUrl: (data.logo_url as string | null) ?? null,
  };
}
