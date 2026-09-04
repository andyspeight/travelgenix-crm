/**
 * Reading the portal session inside a request, and guarding a page.
 *
 * Split from lib/portal/session (which is pure crypto) because these pull in
 * next/headers + next/navigation.
 *
 * The cookie is signed and carries its own expiry, but a signature only proves
 * the grant was issued — not that it is still deserved. An agent who removes a
 * traveller from a household, or deletes them, would otherwise leave that
 * person's existing cookie working for up to thirty days. So every use is
 * re-checked against the database: the contact must still exist, in the same
 * agency, in the same household. One indexed lookup, and the cost of getting
 * this wrong is someone reading a family's trips after they were removed from
 * it.
 */

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createPortalClient } from "./client";
import {
  PORTAL_COOKIE,
  portalEnabled,
  verifyPortalSession,
  type PortalSession,
} from "./session";

/**
 * Is this grant still good? Confirms the contact named in the cookie is still
 * in the household and agency it was issued for.
 *
 * A database error is treated as NOT valid: a portal that cannot check its own
 * grants must close, not open.
 */
export async function portalGrantStillValid(session: PortalSession): Promise<boolean> {
  try {
    const supabase = createPortalClient();
    const { data, error } = await supabase
      .from("contacts")
      .select("id")
      .eq("agency_id", session.agencyId)
      .eq("household_id", session.householdId)
      .eq("id", session.contactId)
      .maybeSingle();
    if (error) {
      console.error("[portal] grant re-check failed:", error.message);
      return false;
    }
    return Boolean(data);
  } catch {
    return false;
  }
}

/**
 * The current portal session from the cookie, or null.
 *
 * Verifies the signature and expiry, then re-checks the grant against the
 * database. Callers that only need the signature (the logout route, say) can
 * pass { recheck: false }.
 */
export async function readPortalSession(
  opts: { recheck?: boolean } = {}
): Promise<PortalSession | null> {
  if (!portalEnabled()) return null;
  const session = await verifyPortalSession(cookies().get(PORTAL_COOKIE)?.value);
  if (!session) return null;
  if (opts.recheck === false) return session;
  return (await portalGrantStillValid(session)) ? session : null;
}

/**
 * The session for a portal PAGE, or a redirect to login. Pages should confirm
 * portalEnabled() first (the layout does), so a disabled portal 404s rather
 * than redirect-loops.
 */
export async function requirePortalSession(): Promise<PortalSession> {
  const session = await readPortalSession();
  if (!session) redirect("/portal/login");
  return session;
}
