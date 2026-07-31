/**
 * The request's identity, resolved once and used everywhere.
 *
 * Two modes, deliberately, so the switch to real sign-in is a deployment
 * decision rather than a big-bang rewrite:
 *
 *   CONTROL MODE (CONTROL_BASE_URL set) — the caller's `tg_session` cookie is
 *   resolved through Control, and their agency is whichever Luna Work agency
 *   carries that Control client id. A session that resolves to no mapped
 *   agency gets nothing: we never fall back to a default tenant, because
 *   "couldn't work out who you are" must never mean "here is someone else's
 *   data".
 *
 *   SINGLE-TENANT MODE (no CONTROL_BASE_URL) — the demo/dev behaviour that is
 *   live today: the one agency from NEXT_PUBLIC_AGENCY_ID, optionally behind
 *   the LUNA_ACCESS_CODE gate. Nothing changes until Control is switched on.
 *
 * Everything reads `agencyId` from here rather than the module-level constant,
 * so making the app genuinely multi-tenant is a matter of swapping the source,
 * not of touching every query by hand.
 */

import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createSystemClient, AGENCY_ID } from "@/lib/supabase/server";
import {
  controlConfigured,
  resolveControlSession,
  type ControlRole,
  type ControlSession,
} from "@/lib/auth/control";

export type LunaSession = {
  agencyId: string;
  /** null in single-tenant mode: nobody is signed in, there is just the agency. */
  control: ControlSession | null;
  role: ControlRole;
};

/**
 * Resolve the agency a Control client maps to, or null when unmapped.
 * Exported so the settings screen can say "this workspace is linked to X"
 * and an admin can see when a link is missing.
 */
export async function agencyForControlClient(
  clientRecordId: string
): Promise<string | null> {
  // The SYSTEM client deliberately: this lookup is what answers "which
  // agency is this request?", so it cannot itself be scoped to an agency
  // without asking the question it is here to answer.
  const supabase = createSystemClient();
  const { data } = await supabase
    .from("agencies")
    .select("id")
    .eq("control_client_id", clientRecordId)
    .maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

/**
 * The current session, or null when the caller may not be here.
 *
 * Null means "signed out or not entitled" — callers should redirect to
 * Control's sign-in rather than rendering anything.
 */
export const getSession = cache(async function getSession(): Promise<LunaSession | null> {
  if (!controlConfigured()) {
    // Single-tenant mode: the access gate (middleware) has already decided
    // whether this request may proceed at all.
    return { agencyId: AGENCY_ID, control: null, role: "owner" };
  }

  const h = headers();
  const control = await resolveControlSession(
    h.get("cookie"),
    h.get("x-tg-act-as")
  );
  if (!control) return null;

  const agencyId = await agencyForControlClient(control.clientRecordId);
  if (!agencyId) return null; // entitled, but this agency isn't set up here yet

  return { agencyId, control, role: control.role };
});

/**
 * Who Control says this caller is, EVEN IF no agency here maps to them.
 *
 * getSession() deliberately returns null in that case — an unmapped session
 * must not reach any data. But then the person is left staring at a refusal
 * with nothing to act on. This gives the /no-access page the one fact that
 * makes it fixable: which Control client they arrived as, so it can be
 * mapped without anyone guessing.
 */
export async function controlIdentity(): Promise<ControlSession | null> {
  if (!controlConfigured()) return null;
  const h = headers();
  return resolveControlSession(h.get("cookie"), h.get("x-tg-act-as"));
}

/**
 * The agency for THIS request, or null — without redirecting or throwing.
 *
 * Used by the Supabase client's fetch wrapper to stamp the tenant token onto
 * every query. It must stay quiet: a query is not the place to decide the
 * user should be sent to a sign-in page, and throwing here would turn a
 * missing session into a 500 instead of an empty, RLS-enforced result.
 */
export async function currentAgencyIdQuiet(): Promise<string | null> {
  try {
    const session = await getSession();
    return session ? session.agencyId : null;
  } catch {
    return null;
  }
}

/**
 * The agency whose data this request may touch — for PAGES.
 *
 * Every server component that queries uses this instead of a module-level
 * constant, so the tenant is a property of the request rather than of the
 * deployment. When it can't be resolved (signed in but not entitled to Luna
 * Work, or an agency nobody has linked yet) the page redirects to /no-access
 * rather than rendering: no session, no data, no guessing.
 */
export async function requireAgencyId(): Promise<string> {
  const session = await getSession();
  if (!session) redirect("/no-access");
  return session.agencyId;
}

/**
 * The agency whose data this request may touch — for API ROUTES.
 *
 * Returns null instead of redirecting, so the route answers with JSON the
 * caller can act on. Every route must treat null as 403 and return before
 * touching the database.
 */
export async function apiAgencyId(): Promise<string | null> {
  const session = await getSession();
  return session ? session.agencyId : null;
}
