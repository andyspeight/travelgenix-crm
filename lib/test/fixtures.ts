/**
 * Test fixtures — minimal factory helpers that return fully-typed rows with
 * sensible defaults, so each test only states the fields it actually cares
 * about. Keeps the unit tests readable and resistant to schema churn.
 */

import type { Contact, Household, Trip } from "@/lib/supabase/types";

/** ISO date `n` days from the given anchor (default: the epoch-stable "now"). */
export function isoDaysFrom(anchor: Date, days: number): string {
  const d = new Date(anchor);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

export function makeHousehold(over: Partial<Household> = {}): Household {
  return {
    id: "h1",
    agency_id: "a1",
    display_name: "Smith Family",
    household_type: "family",
    city: "Poole",
    postcode: "BH1",
    country: "GB",
    tags: [],
    notes: null,
    customer_since: null,
    lifetime_value: 0,
    trips_count: 0,
    last_booking_at: null,
    next_departure: null,
    owner_user_id: null,
    ai_brief: null,
    ai_brief_at: null,
    ai_match: null,
    created_at: "2020-01-01T00:00:00.000Z",
    updated_at: "2020-01-01T00:00:00.000Z",
    ...over,
  };
}

export function makeContact(over: Partial<Contact> = {}): Contact {
  return {
    id: "c1",
    agency_id: "a1",
    household_id: "h1",
    role: "lead",
    first_name: "Jane",
    last_name: "Smith",
    email: "jane@example.com",
    phone: null,
    date_of_birth: null,
    passport_expiry: null,
    passport_country: null,
    dietary: null,
    flags: [],
    marketing_opt_in: true,
    gdpr_consent: true,
    created_at: "2020-01-01T00:00:00.000Z",
    updated_at: "2020-01-01T00:00:00.000Z",
    ...over,
  };
}

export function makeTrip(over: Partial<Trip> = {}): Trip {
  return {
    id: "t1",
    agency_id: "a1",
    household_id: "h1",
    reference: "TG-001",
    stage: "booked",
    destination: "Crete",
    destination_country: "GR",
    depart_date: null,
    return_date: null,
    duration_nights: 7,
    total_value: 5000,
    currency: "GBP",
    occasion: null,
    notes: null,
    source: null,
    ai_predictions: {},
    created_at: "2020-01-01T00:00:00.000Z",
    updated_at: "2020-01-01T00:00:00.000Z",
    ...over,
  };
}
