/**
 * Reading the portal session inside a request, and guarding a page.
 *
 * Split from lib/portal/session (which is pure crypto) because these pull in
 * next/headers + next/navigation.
 */

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  PORTAL_COOKIE,
  portalEnabled,
  verifyPortalSession,
  type PortalSession,
} from "./session";

/** The current portal session from the cookie, or null. */
export async function readPortalSession(): Promise<PortalSession | null> {
  if (!portalEnabled()) return null;
  return verifyPortalSession(cookies().get(PORTAL_COOKIE)?.value);
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
