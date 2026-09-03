/**
 * Portal deep links: an emailed link that lands a traveller on the RIGHT
 * screen, already signed in.
 *
 * The quote screen and the trip page are only useful if a customer can reach
 * them from the email their agent sends. This mints the same single-use token
 * the sign-in flow uses, plus a `next` path the auth route redirects to once
 * the token is spent.
 *
 * WHY A LONGER LIFE THAN A SIGN-IN LINK: a person asking to sign in is at
 * their keyboard, so 30 minutes is right. A quote email is read whenever the
 * customer gets to it — an hour, a day, next weekend — and an expired link
 * would send them back to a sign-in screen for no reason. These links live 7
 * days. They remain single-use, are only ever sent to an address already on
 * file, grant only that one household, and the destination is checked to be a
 * portal path, so a link cannot be aimed anywhere else.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { createLoginToken } from "./token";

/** Emailed deep links live 7 days; a self-requested sign-in link, 30 minutes. */
export const INVITE_TOKEN_TTL_MS = 7 * 24 * 60 * 60_000;

/** Where an emailed link may land: inside the portal, and nowhere else. */
export function safeNextPath(next: string | null | undefined): string | null {
  if (typeof next !== "string") return null;
  const value = next.trim();
  // A single leading slash only: "//host" and "/\host" are protocol-relative
  // URLs that would leave the site.
  if (!/^\/portal(?:\/[A-Za-z0-9/_-]*)?$/.test(value)) return null;
  if (value.startsWith("//")) return null;
  return value;
}

/** The public base for customer-facing links. */
export function portalBaseUrl(requestUrl?: string): string {
  const configured = process.env.PORTAL_BASE_URL;
  if (configured) return configured.replace(/\/$/, "");
  if (requestUrl) {
    try {
      return new URL(requestUrl).origin;
    } catch {
      // fall through
    }
  }
  return "https://crm.travelify.io";
}

export type LinkTarget = {
  agencyId: string;
  householdId: string;
  contactId: string;
  email: string;
  /** A portal path, e.g. "/portal/quotes/<id>". Anything else is refused. */
  next: string;
};

/**
 * A signed-in-on-arrival link to a portal page. Returns null when the
 * destination is not a portal path — a caller bug should not become an open
 * redirect.
 */
export async function createPortalLink(
  supabase: SupabaseClient,
  target: LinkTarget,
  requestUrl?: string
): Promise<string | null> {
  const next = safeNextPath(target.next);
  if (!next) return null;

  const token = await createLoginToken(
    supabase,
    {
      agencyId: target.agencyId,
      householdId: target.householdId,
      contactId: target.contactId,
      email: target.email,
    },
    Date.now(),
    INVITE_TOKEN_TTL_MS
  );
  const base = portalBaseUrl(requestUrl);
  return `${base}/api/portal/auth?token=${token}&next=${encodeURIComponent(next)}`;
}

export type PortalRecipient = {
  contactId: string;
  email: string;
  firstName: string;
  lastName: string | null;
};

/**
 * Who to write to for a household: the lead contact when they have an email,
 * otherwise the first member who does. Null when nobody can be emailed.
 */
export async function householdRecipient(
  supabase: SupabaseClient,
  agencyId: string,
  householdId: string
): Promise<PortalRecipient | null> {
  const { data } = await supabase
    .from("contacts")
    .select("id, first_name, last_name, email, role")
    .eq("agency_id", agencyId)
    .eq("household_id", householdId);

  const rows = ((data ?? []) as Record<string, unknown>[]).filter(
    (c) => typeof c.email === "string" && (c.email as string).includes("@")
  );
  if (rows.length === 0) return null;
  // The household's lead, when they can be emailed; otherwise whoever can.
  const chosen = rows.find((c) => c.role === "lead") ?? rows[0]!;
  return {
    contactId: chosen.id as string,
    email: (chosen.email as string).trim().toLowerCase(),
    firstName: (chosen.first_name as string) ?? "",
    lastName: (chosen.last_name as string | null) ?? null,
  };
}
