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

import { headers } from "next/headers";
import { createClient, AGENCY_ID } from "@/lib/supabase/server";
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
  const supabase = createClient();
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
export async function getSession(): Promise<LunaSession | null> {
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
}
