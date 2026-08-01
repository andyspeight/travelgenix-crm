/**
 * The event spine — emitters for the shared data loop (blueprint §2).
 *
 * Products in the Luna suite talk through typed events rather than imports:
 * enquiry.created, quote.sent, booking.created, campaign.clicked and so on.
 * This module is the CRM's producer side. Travelify and Luna Marketing plug
 * into the same `events` table (source 'travelify' / 'luna_marketing') when
 * their webhooks land; consumers read the stream newest-first.
 *
 * Contract: emitting is ALWAYS best-effort. An analytics/integration write
 * must never fail or slow the user action that caused it, so emitEvent
 * swallows every error (logging it server-side) and the caller never awaits
 * anything critical on it.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

/** Event types the CRM emits today. Extend as features land. */
export type CrmEventType =
  | "enquiry.created"
  | "enquiry.responded"
  | "enquiry.converted"
  | "enquiry.closed"
  | "quote.sent"
  | "quote.viewed"
  | "quote.accepted"
  | "quote.declined"
  | "quote.revised"
  | "consent.updated"
  | "trip.stage_changed"
  | "booking.created"
  | "trip.completed"
  | "task.completed"
  | "customer.created"
  | "journey.executed"
  | "case.opened"
  | "case.resolved"
  | "email.sent"
  | "email.bounced"
  | "commission.received"
  | "email.replied"
  // An out-of-office. Recorded separately so nothing downstream can mistake
  // a machine's acknowledgement for a customer's answer.
  | "email.auto_replied";

export type EmitArgs = {
  type: CrmEventType;
  subjectType: "enquiry" | "trip" | "household" | "interaction" | "quote" | "contact" | "task" | "journey" | "case" | "email";
  subjectId: string;
  householdId?: string | null;
  payload?: Record<string, unknown>;
};

export async function emitEvent(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  agencyId: string,
  args: EmitArgs
): Promise<void> {
  try {
    const { error } = await supabase.from("events").insert({
      agency_id: agencyId,
      type: args.type,
      source: "crm",
      subject_type: args.subjectType,
      subject_id: args.subjectId,
      household_id: args.householdId ?? null,
      payload: args.payload ?? {},
    });
    if (error) {
      // Most likely: the events migration hasn't been run yet. The feature
      // that emitted still worked — say so quietly and move on.
      console.error(`[events] emit ${args.type} failed:`, error.message);
    }
  } catch (err) {
    console.error(`[events] emit ${args.type} threw:`, err);
  }
}
