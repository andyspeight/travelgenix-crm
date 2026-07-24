/**
 * Database types — minimal scaffolding.
 *
 * In a real workflow we'd run `supabase gen types typescript` and commit the
 * generated file. For the MVP we hand-maintain the row shapes for our app
 * code, but use a permissive Database type so inserts/updates don't get
 * blocked by the type system before we have a generator wired in.
 *
 * Day 5+ swaps this for the auto-generated types.
 */

export type TripStage =
  | "enquiry"
  | "quoted"
  | "booked"
  | "pre_departure"
  | "travelling"
  | "returned"
  | "cancelled";

export type ContactRole = "lead" | "partner" | "child" | "dependant" | "other";

export type InteractionKind =
  | "email_in"
  | "email_out"
  | "chat"
  | "enquiry"
  | "call"
  | "note"
  | "system";

export type Household = {
  id: string;
  agency_id: string;
  display_name: string;
  household_type: "family" | "couple" | "solo" | "group" | null;
  city: string | null;
  postcode: string | null;
  country: string | null;
  tags: string[];
  notes: string | null;
  customer_since: string | null;
  lifetime_value: number;
  trips_count: number;
  last_booking_at: string | null;
  next_departure: string | null;
  owner_user_id: string | null;
  ai_brief: string | null;
  ai_brief_at: string | null;
  ai_match: {
    headline: string;
    suggestions: { destination: string; reason: string; fit: number }[];
    generated_at?: string;
    model?: string;
  } | null;
  created_at: string;
  updated_at: string;
};

export type Contact = {
  id: string;
  agency_id: string;
  household_id: string;
  role: ContactRole;
  first_name: string;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  date_of_birth: string | null;
  passport_expiry: string | null;
  dietary: string | null;
  flags: string[];
  marketing_opt_in: boolean;
  gdpr_consent: boolean;
  created_at: string;
  updated_at: string;
};

export type Trip = {
  id: string;
  agency_id: string;
  household_id: string;
  reference: string | null;
  stage: TripStage;
  destination: string | null;
  destination_country: string | null;
  depart_date: string | null;
  return_date: string | null;
  duration_nights: number | null;
  total_value: number | null;
  currency: string;
  occasion: string | null;
  notes: string | null;
  source: string | null;
  ai_predictions: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type Interaction = {
  id: string;
  agency_id: string;
  household_id: string | null;
  contact_id: string | null;
  trip_id: string | null;
  kind: InteractionKind;
  channel: string | null;
  direction: "inbound" | "outbound" | "internal";
  subject: string | null;
  body: string | null;
  body_summary: string | null;
  ai_priority: "today" | "week" | "later" | null;
  ai_reason: string | null;
  ai_drafts: Record<string, unknown>;
  is_read: boolean;
  is_triaged: boolean;
  occurred_at: string;
};

export type EnquiryStatus = "new" | "responded" | "converted" | "closed";

/** One of the four separate qualification scores. Null score = insufficient data. */
export type EnquiryScore = { score: number | null; reason: string };

export type EnquiryScores = {
  likelihood: EnquiryScore;
  value: EnquiryScore;
  urgency: EnquiryScore;
  fit: EnquiryScore;
};

export type Enquiry = {
  id: string;
  agency_id: string;
  household_id: string | null;
  trip_id: string | null;
  status: EnquiryStatus;
  source: string | null;
  channel_preference: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  destination: string | null;
  depart_date: string | null;
  date_flexibility: "fixed" | "flexible" | "very_flexible" | null;
  duration_nights: number | null;
  departure_airport: string | null;
  adults: number | null;
  children: number | null;
  child_ages: string | null;
  budget: number | null;
  budget_basis: "total" | "per_person" | null;
  holiday_type: string | null;
  board_basis: string | null;
  accommodation: string | null;
  occasion: string | null;
  must_haves: string[];
  deal_breakers: string[];
  original_wording: string | null;
  ai_summary: string | null;
  ai_extracted: boolean;
  scores: EnquiryScores | null;
  received_at: string;
  first_response_due_at: string | null;
  first_response_at: string | null;
  assigned_user_id: string | null;
  notes: string | null;
  lost_reason: string | null;
  created_at: string;
  updated_at: string;
};

export type QuoteStatus =
  | "draft"
  | "sent"
  | "viewed"
  | "accepted"
  | "declined"
  | "expired"
  | "superseded";

export type Quote = {
  id: string;
  agency_id: string;
  trip_id: string;
  household_id: string | null;
  reference: string | null;
  version: number;
  status: QuoteStatus;
  total_price: number | null;
  deposit: number | null;
  expected_margin: number | null;
  currency: string;
  options_summary: string | null;
  sent_at: string | null;
  expires_at: string | null;
  viewed_at: string | null;
  view_count: number;
  customer_response: string | null;
  declined_reason: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type ConsentRow = {
  id: string;
  agency_id: string;
  contact_id: string;
  household_id: string | null;
  channel: "email" | "sms" | "whatsapp" | "phone" | "post" | "profiling";
  granted: boolean;
  source: string;
  wording: string | null;
  evidence: string | null;
  recorded_by: string | null;
  occurred_at: string;
  created_at: string;
};

export type CaseStatus = "open" | "in_progress" | "waiting" | "resolved" | "closed";

export type CaseRow = {
  id: string;
  agency_id: string;
  household_id: string | null;
  trip_id: string | null;
  case_type: string;
  subject: string;
  detail: string | null;
  status: CaseStatus;
  priority: 1 | 2 | 3 | 4;
  priority_reason: string | null;
  opened_at: string;
  sla_due_at: string | null;
  resolved_at: string | null;
  resolution: string | null;
  owner_user_id: string | null;
  created_at: string;
  updated_at: string;
};

export type EventRow = {
  id: string;
  agency_id: string;
  type: string;
  source: string;
  subject_type: string | null;
  subject_id: string | null;
  household_id: string | null;
  payload: Record<string, unknown>;
  occurred_at: string;
};

/**
 * Permissive Database type — lets us insert/update without per-table type
 * fights during MVP. The proper generated type comes in phase 2.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Database = any;
