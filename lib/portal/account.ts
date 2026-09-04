/**
 * A trip's account, from Travelify: payments taken, balance remaining, what
 * is due next, and the documents on the booking.
 *
 * Travelify is the source of truth for all of this; the CRM stores only the
 * booking reference. The lookup is the My Booking widget's (reference + lead
 * traveller email + departure date), made server-to-server through Control
 * (lib/travelify/order). Everything here is scoped to the household named in
 * the session: the trip has already been verified to belong to it, and the
 * lead traveller is read from that household only.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { PortalSession } from "./session";
import { fetchTravelifyOrder, travelifyConfigured } from "@/lib/travelify/order";
import { computeAccount, type AccountBalance, type TravelifyDocument } from "@/lib/travelify/balance";

export type TripAccount =
  | {
      status: "ok";
      balance: AccountBalance;
      documents: TravelifyDocument[];
      currency: string;
      orderStatus: string | null;
    }
  /** No Travelify booking is linked to this trip (or the feature is off). */
  | { status: "none" }
  /** Linked, but Travelify could not be reached or did not recognise the booking. */
  | { status: "unavailable" };

export type AccountTrip = {
  id: string;
  travelifyOrderRef: string | null;
  departDate: string | null;
  currency: string;
};

export async function getTripAccount(
  supabase: SupabaseClient,
  session: PortalSession,
  trip: AccountTrip,
  opts: { ip?: string | null; timeoutMs?: number } = {}
): Promise<TripAccount> {
  if (!travelifyConfigured() || !trip.travelifyOrderRef || !trip.departDate) {
    return { status: "none" };
  }

  const [{ data: agency }, email] = await Promise.all([
    supabase.from("agencies").select("control_client_id").eq("id", session.agencyId).maybeSingle(),
    leadTravellerEmail(supabase, session, trip.id),
  ]);
  const clientRecordId = (agency?.control_client_id as string | null) ?? null;
  if (!clientRecordId || !email) return { status: "none" };

  const result = await fetchTravelifyOrder({
    clientRecordId,
    emailAddress: email,
    departDate: trip.departDate,
    orderRef: trip.travelifyOrderRef,
    ip: opts.ip ?? null,
    timeoutMs: opts.timeoutMs,
  });
  if (!result.ok) {
    return result.reason === "not_configured" || result.reason === "invalid"
      ? { status: "none" }
      : { status: "unavailable" };
  }

  const order = result.order;
  return {
    status: "ok",
    balance: computeAccount(order),
    documents: Array.isArray(order.documents) ? order.documents.filter((d) => /^https:\/\//.test(d.url)) : [],
    currency: order.currency || trip.currency || "GBP",
    orderStatus: order.status ?? null,
  };
}

/**
 * The email Travelify knows the booking by: the lead traveller's, falling
 * back to the signed-in traveller's. Both reads stay inside the household.
 */
async function leadTravellerEmail(
  supabase: SupabaseClient,
  session: PortalSession,
  tripId: string
): Promise<string | null> {
  const { data: pax } = await supabase
    .from("trip_passengers")
    .select("contact_id, is_lead")
    .eq("trip_id", tripId);
  const rows = (pax ?? []) as { contact_id: string; is_lead: boolean | null }[];
  const lead = rows.find((p) => p.is_lead)?.contact_id ?? null;

  const ids = Array.from(new Set([lead, session.contactId].filter((v): v is string => Boolean(v))));
  if (ids.length === 0) return null;
  const { data: people } = await supabase
    .from("contacts")
    .select("id, email")
    .eq("agency_id", session.agencyId)
    .eq("household_id", session.householdId)
    .in("id", ids);
  const byId = new Map(((people ?? []) as { id: string; email: string | null }[]).map((c) => [c.id, c.email]));
  const email = (lead && byId.get(lead)) || byId.get(session.contactId) || null;
  return email ? email.trim().toLowerCase() : null;
}
