/**
 * The portal's read model — everything a signed-in traveller may see.
 *
 * EVERY query here is scoped to the household named in the verified session:
 * `.eq("agency_id", agencyId)` plus the household (directly, or via a trip that
 * has already been confirmed to belong to the household). A traveller can only
 * ever read their own household's rows; there are no list or search paths that
 * cross that boundary. The tenant-filter guard enforces the agency scope on
 * every tenant-table query in this file.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type PortalBranding = {
  agencyName: string;
  brandColor: string | null;
  logoUrl: string | null;
  /** Where a traveller can reach the agency (reply-to, else from address). */
  contactEmail: string | null;
};

export type PortalAddress = {
  line1: string | null;
  line2: string | null;
  city: string | null;
  county: string | null;
  postcode: string | null;
};

export type PortalContact = {
  id: string;
  firstName: string;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  dietary: string | null;
};

export type PortalTripSummary = {
  id: string;
  reference: string | null;
  destination: string | null;
  stage: string;
  departDate: string | null;
  returnDate: string | null;
  nights: number | null;
  totalValue: number | null;
  currency: string;
  occasion: string | null;
  /** Travelify booking reference, when the agent has linked one. */
  travelifyOrderRef: string | null;
};

export type PortalComponent = {
  id: string;
  kind: string;
  title: string;
  startDate: string | null;
  endDate: string | null;
  status: string;
};

export type PortalPassenger = {
  name: string;
  isLead: boolean;
};

export type PortalTripDetail = PortalTripSummary & {
  components: PortalComponent[];
  passengers: PortalPassenger[];
};

/** Trip stages a customer should see — real trips, not internal enquiries. */
const CUSTOMER_STAGES = ["booked", "pre_departure", "travelling", "returned"];

export async function getBranding(
  supabase: SupabaseClient,
  agencyId: string
): Promise<PortalBranding> {
  const { data } = await supabase
    .from("agencies")
    .select("name, brand_color, logo_url, email_reply_to, email_from_address")
    .eq("id", agencyId)
    .maybeSingle();
  const contact =
    ((data?.email_reply_to as string | null) || (data?.email_from_address as string | null) || "").trim();
  return {
    agencyName: (data?.name as string | undefined) || "Your travel agent",
    brandColor: (data?.brand_color as string | null) ?? null,
    logoUrl: (data?.logo_url as string | null) ?? null,
    contactEmail: contact || null,
  };
}

export async function getContact(
  supabase: SupabaseClient,
  agencyId: string,
  contactId: string
): Promise<PortalContact | null> {
  const { data } = await supabase
    .from("contacts")
    .select("id, first_name, last_name, email, phone, dietary")
    .eq("agency_id", agencyId)
    .eq("id", contactId)
    .maybeSingle();
  if (!data) return null;
  return {
    id: data.id as string,
    firstName: (data.first_name as string) ?? "",
    lastName: (data.last_name as string | null) ?? null,
    email: (data.email as string | null) ?? null,
    phone: (data.phone as string | null) ?? null,
    dietary: (data.dietary as string | null) ?? null,
  };
}

/** The household's address — shared by everyone in it. */
export async function getAddress(
  supabase: SupabaseClient,
  agencyId: string,
  householdId: string
): Promise<PortalAddress> {
  const { data } = await supabase
    .from("households")
    .select("address_line1, address_line2, city, county, postcode")
    .eq("agency_id", agencyId)
    .eq("id", householdId)
    .maybeSingle();
  return {
    line1: (data?.address_line1 as string | null) ?? null,
    line2: (data?.address_line2 as string | null) ?? null,
    city: (data?.city as string | null) ?? null,
    county: (data?.county as string | null) ?? null,
    postcode: (data?.postcode as string | null) ?? null,
  };
}

export async function listTrips(
  supabase: SupabaseClient,
  agencyId: string,
  householdId: string
): Promise<PortalTripSummary[]> {
  const { data } = await supabase
    .from("trips")
    .select(
      "id, reference, destination, stage, depart_date, return_date, duration_nights, total_value, currency, occasion, travelify_order_ref"
    )
    .eq("agency_id", agencyId)
    .eq("household_id", householdId)
    .in("stage", CUSTOMER_STAGES)
    .order("depart_date", { ascending: false });
  return ((data ?? []) as Record<string, unknown>[]).map(toSummary);
}

export async function getTrip(
  supabase: SupabaseClient,
  agencyId: string,
  householdId: string,
  tripId: string
): Promise<PortalTripDetail | null> {
  // Confirm the trip belongs to this household before reading anything under it.
  const { data: trip } = await supabase
    .from("trips")
    .select(
      "id, reference, destination, stage, depart_date, return_date, duration_nights, total_value, currency, occasion, travelify_order_ref"
    )
    .eq("agency_id", agencyId)
    .eq("household_id", householdId)
    .eq("id", tripId)
    .in("stage", CUSTOMER_STAGES)
    .maybeSingle();
  if (!trip) return null;

  // Children are keyed by the now-verified trip id (they carry no agency_id).
  const { data: comps } = await supabase
    .from("trip_components")
    .select("id, kind, title, start_date, end_date, status")
    .eq("trip_id", tripId)
    .order("start_date", { ascending: true });

  const { data: pax } = await supabase
    .from("trip_passengers")
    .select("contact_id, is_lead")
    .eq("trip_id", tripId);

  const passengerIds = ((pax ?? []) as Record<string, unknown>[]).map(
    (p) => p.contact_id as string
  );
  const leadById = new Map(
    ((pax ?? []) as Record<string, unknown>[]).map((p) => [
      p.contact_id as string,
      Boolean(p.is_lead),
    ])
  );

  let passengers: PortalPassenger[] = [];
  if (passengerIds.length) {
    const { data: people } = await supabase
      .from("contacts")
      .select("id, first_name, last_name")
      .eq("agency_id", agencyId)
      .eq("household_id", householdId)
      .in("id", passengerIds);
    passengers = ((people ?? []) as Record<string, unknown>[]).map((c) => ({
      name: [c.first_name, c.last_name].filter(Boolean).join(" ") || "Traveller",
      isLead: leadById.get(c.id as string) ?? false,
    }));
  }

  return {
    ...toSummary(trip as Record<string, unknown>),
    components: ((comps ?? []) as Record<string, unknown>[]).map((c) => ({
      id: c.id as string,
      kind: (c.kind as string) ?? "other",
      title: (c.title as string) ?? "",
      startDate: (c.start_date as string | null) ?? null,
      endDate: (c.end_date as string | null) ?? null,
      status: (c.status as string) ?? "pending",
    })),
    passengers,
  };
}

function toSummary(t: Record<string, unknown>): PortalTripSummary {
  return {
    id: t.id as string,
    reference: (t.reference as string | null) ?? null,
    destination: (t.destination as string | null) ?? null,
    stage: (t.stage as string) ?? "booked",
    departDate: (t.depart_date as string | null) ?? null,
    returnDate: (t.return_date as string | null) ?? null,
    nights: (t.duration_nights as number | null) ?? null,
    totalValue: (t.total_value as number | null) ?? null,
    currency: (t.currency as string) ?? "GBP",
    occasion: (t.occasion as string | null) ?? null,
    travelifyOrderRef: (t.travelify_order_ref as string | null) ?? null,
  };
}

// ─── Quotes ──────────────────────────────────────────────────────────────

export type PortalQuoteTrip = {
  id: string;
  reference: string | null;
  destination: string | null;
  departDate: string | null;
  returnDate: string | null;
  nights: number | null;
  occasion: string | null;
};

export type PortalQuote = {
  id: string;
  version: number;
  status: string;
  reference: string | null;
  totalPrice: number | null;
  deposit: number | null;
  currency: string;
  optionsSummary: string | null;
  sentAt: string | null;
  expiresAt: string | null;
  viewCount: number;
  trip: PortalQuoteTrip;
};

/** Quote statuses a customer is shown as "for you to decide on" (or lately expired). */
const CUSTOMER_QUOTE_STATUSES = ["sent", "viewed", "expired"];

const QUOTE_COLS =
  "id, trip_id, version, status, reference, total_price, deposit, currency, options_summary, sent_at, expires_at, view_count";
const QUOTE_TRIP_COLS = "id, reference, destination, depart_date, return_date, duration_nights, occasion";

/**
 * The household's open quotes, newest first. A quote is only shown once its
 * trip has ALSO been confirmed to belong to the household, so a mis-linked
 * quote can never expose another family's trip.
 */
export async function listQuotes(
  supabase: SupabaseClient,
  agencyId: string,
  householdId: string
): Promise<PortalQuote[]> {
  const { data } = await supabase
    .from("quotes")
    .select(QUOTE_COLS)
    .eq("agency_id", agencyId)
    .eq("household_id", householdId)
    .in("status", CUSTOMER_QUOTE_STATUSES)
    .order("sent_at", { ascending: false, nullsFirst: false });
  const rows = (data ?? []) as Record<string, unknown>[];
  if (rows.length === 0) return [];

  const tripIds = Array.from(new Set(rows.map((q) => q.trip_id as string)));
  const { data: trips } = await supabase
    .from("trips")
    .select(QUOTE_TRIP_COLS)
    .eq("agency_id", agencyId)
    .eq("household_id", householdId)
    .in("id", tripIds);
  const tripById = new Map(
    ((trips ?? []) as Record<string, unknown>[]).map((t) => [t.id as string, toQuoteTrip(t)])
  );

  return rows
    .map((q) => {
      const trip = tripById.get(q.trip_id as string);
      return trip ? toQuote(q, trip) : null;
    })
    .filter((q): q is PortalQuote => q !== null);
}

/** One quote of the household's, in any status (so a decided quote still renders). */
export async function getQuote(
  supabase: SupabaseClient,
  agencyId: string,
  householdId: string,
  quoteId: string
): Promise<PortalQuote | null> {
  const { data: q } = await supabase
    .from("quotes")
    .select(QUOTE_COLS)
    .eq("agency_id", agencyId)
    .eq("household_id", householdId)
    .eq("id", quoteId)
    .maybeSingle();
  if (!q) return null;

  const { data: trip } = await supabase
    .from("trips")
    .select(QUOTE_TRIP_COLS)
    .eq("agency_id", agencyId)
    .eq("household_id", householdId)
    .eq("id", q.trip_id as string)
    .maybeSingle();
  if (!trip) return null;

  return toQuote(q as Record<string, unknown>, toQuoteTrip(trip as Record<string, unknown>));
}

function toQuoteTrip(t: Record<string, unknown>): PortalQuoteTrip {
  return {
    id: t.id as string,
    reference: (t.reference as string | null) ?? null,
    destination: (t.destination as string | null) ?? null,
    departDate: (t.depart_date as string | null) ?? null,
    returnDate: (t.return_date as string | null) ?? null,
    nights: (t.duration_nights as number | null) ?? null,
    occasion: (t.occasion as string | null) ?? null,
  };
}

function toQuote(q: Record<string, unknown>, trip: PortalQuoteTrip): PortalQuote {
  return {
    id: q.id as string,
    version: (q.version as number) ?? 1,
    status: (q.status as string) ?? "sent",
    reference: (q.reference as string | null) ?? null,
    totalPrice: q.total_price == null ? null : Number(q.total_price),
    deposit: q.deposit == null ? null : Number(q.deposit),
    currency: (q.currency as string) ?? "GBP",
    optionsSummary: (q.options_summary as string | null) ?? null,
    sentAt: (q.sent_at as string | null) ?? null,
    expiresAt: (q.expires_at as string | null) ?? null,
    viewCount: (q.view_count as number) ?? 0,
    trip,
  };
}
