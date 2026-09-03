/**
 * POST /api/portal/quotes/[id] — a customer's moves on their own quote.
 *
 * Body: { action: "view" | "accept" | "decline", reason? }
 *
 *   view     the customer opened the quote (view_count, viewed_at, quote.viewed)
 *            — the signal Quote Rescue was designed around, now real
 *   accept   the booking moment, via the shared lifecycle (trip booked at the
 *            quoted price, rollups, timeline, quote.accepted)
 *   decline  with the customer's own words as the reason
 *
 * The quote is loaded scoped to BOTH the agency and the household named in
 * the verified session before anything is written; a quote outside the
 * household does not exist as far as this endpoint is concerned. An expired
 * price can never be accepted here, even before the nightly job marks it.
 */

import { NextResponse } from "next/server";
import { enforceRateLimit, clientKey } from "@/lib/ai/rate-limit";
import { portalEnabled } from "@/lib/portal/session";
import { readPortalSession } from "@/lib/portal/require";
import { createPortalClient } from "@/lib/portal/client";
import { quoteState } from "@/lib/portal/format";
import { acceptQuote, declineQuote, recordQuoteView } from "@/lib/quotes/lifecycle";
import type { Quote } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACTIONS = new Set(["view", "accept", "decline"]);

export async function POST(request: Request, { params }: { params: { id: string } }) {
  if (!portalEnabled()) {
    return NextResponse.json({ ok: false, error: "Not available" }, { status: 404 });
  }
  const session = await readPortalSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "Please sign in again." }, { status: 401 });
  }
  const id = params.id;
  if (!id || !UUID_RE.test(id)) {
    return NextResponse.json({ ok: false, error: "Invalid quote" }, { status: 400 });
  }

  let body: { action?: unknown; reason?: unknown } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });
  }
  const action = typeof body.action === "string" && ACTIONS.has(body.action) ? body.action : null;
  if (!action) {
    return NextResponse.json({ ok: false, error: "Unknown action" }, { status: 400 });
  }

  const limit = await enforceRateLimit(clientKey(request, "portal-quote"), 20, 60_000);
  if (!limit.ok) {
    return NextResponse.json(
      { ok: false, error: "Too many requests. Please wait a moment." },
      { status: 429, headers: { "retry-after": String(limit.retryAfter) } }
    );
  }

  const supabase = createPortalClient();
  const { data: row } = await supabase
    .from("quotes")
    .select("*")
    .eq("agency_id", session.agencyId)
    .eq("household_id", session.householdId)
    .eq("id", id)
    .maybeSingle();
  if (!row) {
    return NextResponse.json({ ok: false, error: "Quote not found" }, { status: 404 });
  }
  const quote = row as Quote;
  const state = quoteState({ status: quote.status, expiresAt: quote.expires_at });

  if (action === "view") {
    // A view on anything but a live quote is not a signal; say so quietly.
    if (state !== "open") return NextResponse.json({ ok: true, counted: false });
    const r = await recordQuoteView(supabase, quote, { actor: "customer" });
    return NextResponse.json({ ok: true, counted: r.ok });
  }

  if (state !== "open") {
    const error =
      state === "expired"
        ? "This quote has expired. Your travel agent can refresh it for you."
        : "This quote has already been decided.";
    return NextResponse.json({ ok: false, error, state }, { status: 409 });
  }

  if (action === "accept") {
    const r = await acceptQuote(supabase, quote, { actor: "customer" });
    if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: r.status });
    return NextResponse.json({ ok: true, state: "accepted", tripId: quote.trip_id });
  }

  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 200) : "";
  const r = await declineQuote(supabase, quote, {
    actor: "customer",
    reason: reason || "Declined in the portal, no reason given",
  });
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: r.status });
  return NextResponse.json({ ok: true, state: "declined" });
}
