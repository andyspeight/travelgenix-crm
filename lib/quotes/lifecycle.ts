/**
 * The quote lifecycle moves that more than one surface performs.
 *
 * The agent's PATCH /api/quotes/[id] and the customer portal both record
 * views, accept and decline — with identical side effects (trip stage, trip
 * value, household rollups, timeline entry, events). One implementation, two
 * callers, so what a customer does in the portal can never drift from what
 * the agent's button does.
 *
 * Every write is scoped by agency. Callers pass a quote they have ALREADY
 * loaded under their own authorisation: the agency session for agents, the
 * household-verified read for the portal.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Quote } from "@/lib/supabase/types";
import { emitEvent } from "@/lib/events/emit";
import { refreshHouseholdRollups } from "@/lib/customer/rollups";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any>;

/** Who is making the move — it shapes the timeline wording and the event payload. */
export type QuoteActor = "agent" | "customer";

export type LifecycleResult =
  | { ok: true }
  | { ok: false; error: string; status: 409 | 500 };

/** Accepted, declined or superseded: nothing more can happen to it. */
export function isResolvedQuote(q: Pick<Quote, "status">): boolean {
  return q.status === "accepted" || q.status === "declined" || q.status === "superseded";
}

const via = (actor: QuoteActor) => (actor === "customer" ? "portal" : "crm");

/**
 * The customer opened the quote: view_count+1, viewed_at, status viewed.
 * Only counts on a live, sent quote — a draft or a resolved quote is not
 * "being considered".
 */
export async function recordQuoteView(
  supabase: Db,
  quote: Quote,
  opts: { actor: QuoteActor }
): Promise<LifecycleResult & { viewCount?: number }> {
  if (isResolvedQuote(quote) || quote.status === "draft") {
    return { ok: false, error: "Views only count on a live, sent quote", status: 409 };
  }
  const nowIso = new Date().toISOString();
  const viewCount = quote.view_count + 1;
  const { error } = await supabase
    .from("quotes")
    .update({ status: "viewed", viewed_at: nowIso, view_count: viewCount })
    .eq("id", quote.id)
    .eq("agency_id", quote.agency_id);
  if (error) return { ok: false, error: error.message, status: 500 };

  await emitEvent(supabase, quote.agency_id, {
    type: "quote.viewed",
    subjectType: "quote",
    subjectId: quote.id,
    householdId: quote.household_id,
    payload: { trip_id: quote.trip_id, view_count: viewCount, via: via(opts.actor) },
  });
  return { ok: true, viewCount };
}

/**
 * The booking moment: the quote is accepted, the trip takes the quoted price
 * and moves to booked, household counters refresh with last_booking_at
 * stamped, the timeline records it, and quote.accepted fires.
 */
export async function acceptQuote(
  supabase: Db,
  quote: Quote,
  opts: { actor: QuoteActor }
): Promise<LifecycleResult> {
  if (isResolvedQuote(quote)) {
    return { ok: false, error: "This quote is already resolved", status: 409 };
  }
  const nowIso = new Date().toISOString();
  const { error } = await supabase
    .from("quotes")
    .update({ status: "accepted" })
    .eq("id", quote.id)
    .eq("agency_id", quote.agency_id);
  if (error) return { ok: false, error: error.message, status: 500 };

  await supabase
    .from("trips")
    .update({ stage: "booked", total_value: quote.total_price, updated_at: nowIso })
    .eq("id", quote.trip_id)
    .eq("agency_id", quote.agency_id);

  if (quote.household_id) {
    await refreshHouseholdRollups(supabase, quote.agency_id, quote.household_id, {
      setLastBookingAt: true,
    });
    const price = `£${Math.round(quote.total_price ?? 0).toLocaleString("en-GB")}`;
    await timeline(supabase, quote, {
      subject:
        opts.actor === "customer"
          ? `Quote v${quote.version} accepted by the customer in the portal`
          : `Quote v${quote.version} accepted`,
      body: `Booked at ${price}. Trip moved to booked.`,
      nowIso,
    });
  }

  await emitEvent(supabase, quote.agency_id, {
    type: "quote.accepted",
    subjectType: "quote",
    subjectId: quote.id,
    householdId: quote.household_id,
    payload: {
      trip_id: quote.trip_id,
      version: quote.version,
      total_price: quote.total_price,
      via: via(opts.actor),
    },
  });
  return { ok: true };
}

/**
 * Declined, with the reason (lost-reason collection). When the customer
 * declines in the portal their words are also kept as customer_response,
 * which is exactly what that field is for.
 */
export async function declineQuote(
  supabase: Db,
  quote: Quote,
  opts: { actor: QuoteActor; reason: string }
): Promise<LifecycleResult> {
  if (isResolvedQuote(quote)) {
    return { ok: false, error: "This quote is already resolved", status: 409 };
  }
  const reason = opts.reason.trim().slice(0, 200) || "No reason recorded";
  const patch: Record<string, unknown> = { status: "declined", declined_reason: reason };
  if (opts.actor === "customer") patch.customer_response = reason;

  const { error } = await supabase
    .from("quotes")
    .update(patch)
    .eq("id", quote.id)
    .eq("agency_id", quote.agency_id);
  if (error) return { ok: false, error: error.message, status: 500 };

  if (opts.actor === "customer" && quote.household_id) {
    await timeline(supabase, quote, {
      subject: `Quote v${quote.version} declined by the customer in the portal`,
      body: reason,
      nowIso: new Date().toISOString(),
    });
  }

  await emitEvent(supabase, quote.agency_id, {
    type: "quote.declined",
    subjectType: "quote",
    subjectId: quote.id,
    householdId: quote.household_id,
    payload: { trip_id: quote.trip_id, version: quote.version, reason, via: via(opts.actor) },
  });
  return { ok: true };
}

/** A timeline entry on the household. Never fails the request. */
async function timeline(
  supabase: Db,
  quote: Quote,
  entry: { subject: string; body: string; nowIso: string }
): Promise<void> {
  try {
    await supabase.from("interactions").insert({
      agency_id: quote.agency_id,
      household_id: quote.household_id,
      trip_id: quote.trip_id,
      kind: "system",
      direction: "internal",
      subject: entry.subject,
      body_summary: entry.body,
      occurred_at: entry.nowIso,
    });
  } catch {
    // Timeline write never fails the request.
  }
}
