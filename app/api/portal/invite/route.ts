/**
 * POST /api/portal/invite — "email the customer a link to this".
 *
 * Body: { kind: "quote" | "trip", id }
 *
 * The agent's side of the portal. It mints a single-use, household-scoped
 * deep link and emails it from the agency, so the customer lands on the quote
 * or the trip already signed in. Which of the three messages goes out is
 * decided HERE, from the record's own state: a quote nobody has opened is
 * "your quote is ready", one that has been read without an answer is the
 * gentle nudge, a trip is "it's confirmed".
 *
 * Agency-scoped: the quote or trip is loaded under the agent's own session
 * before anything is sent, and the link grants only that household.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { apiAgencyId } from "@/lib/auth/session";
import { enforceRateLimit, clientKey } from "@/lib/ai/rate-limit";
import { portalEnabled } from "@/lib/portal/session";
import { createPortalLink, householdRecipient } from "@/lib/portal/invite";
import { sendPortalEmail, type PortalEmailKind } from "@/lib/portal/emails";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  if (!portalEnabled()) {
    return NextResponse.json(
      { ok: false, error: "The customer portal is not switched on for this workspace." },
      { status: 409 }
    );
  }

  let body: { kind?: unknown; id?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }
  const kind = body.kind === "quote" || body.kind === "trip" ? body.kind : null;
  const id = typeof body.id === "string" ? body.id : "";
  if (!kind || !UUID_RE.test(id)) {
    return NextResponse.json({ ok: false, error: "Unknown target" }, { status: 400 });
  }

  const supabase = createClient();
  const agencyId = await apiAgencyId();
  if (!agencyId) {
    return NextResponse.json({ ok: false, error: "No access to this workspace." }, { status: 403 });
  }

  // An agent pressing a button, not a public endpoint — a light cap only, so
  // a stuck click cannot mail a customer twenty times.
  const limit = await enforceRateLimit(clientKey(request, "portal-invite"), 20, 60_000);
  if (!limit.ok) {
    return NextResponse.json(
      { ok: false, error: "Too many sends just now. Wait a moment and try again." },
      { status: 429, headers: { "retry-after": String(limit.retryAfter) } }
    );
  }

  // ─── The record, and which message it deserves ────────────────────────
  let householdId: string;
  let next: string;
  let emailKind: PortalEmailKind;
  let destination: string | null = null;
  let departDate: string | null = null;
  let returnDate: string | null = null;
  let price: number | null = null;
  let currency = "GBP";

  if (kind === "quote") {
    const { data: quote } = await supabase
      .from("quotes")
      .select("id, trip_id, household_id, status, total_price, currency, view_count, expires_at")
      .eq("agency_id", agencyId)
      .eq("id", id)
      .maybeSingle();
    if (!quote) return NextResponse.json({ ok: false, error: "Quote not found" }, { status: 404 });

    const status = quote.status as string;
    if (status === "draft") {
      return NextResponse.json(
        { ok: false, error: "Send the quote first, then email the customer a link." },
        { status: 409 }
      );
    }
    if (status !== "sent" && status !== "viewed") {
      return NextResponse.json(
        { ok: false, error: "This quote is already resolved." },
        { status: 409 }
      );
    }
    if (!quote.household_id) {
      return NextResponse.json(
        { ok: false, error: "This quote isn't linked to a household yet." },
        { status: 409 }
      );
    }

    householdId = quote.household_id as string;
    next = `/portal/quotes/${quote.id as string}`;
    // Read but never answered is the nudge; anything else is the first send.
    emailKind = status === "viewed" || (quote.view_count as number) > 0 ? "quote_nudge" : "quote_ready";
    price = quote.total_price == null ? null : Number(quote.total_price);
    currency = (quote.currency as string) || "GBP";

    const { data: trip } = await supabase
      .from("trips")
      .select("destination, depart_date, return_date")
      .eq("agency_id", agencyId)
      .eq("id", quote.trip_id as string)
      .maybeSingle();
    destination = (trip?.destination as string | null) ?? null;
    departDate = (trip?.depart_date as string | null) ?? null;
    returnDate = (trip?.return_date as string | null) ?? null;
  } else {
    const { data: trip } = await supabase
      .from("trips")
      .select("id, household_id, stage, destination, depart_date, return_date")
      .eq("agency_id", agencyId)
      .eq("id", id)
      .maybeSingle();
    if (!trip) return NextResponse.json({ ok: false, error: "Trip not found" }, { status: 404 });

    const stage = trip.stage as string;
    if (!["booked", "pre_departure", "travelling", "returned"].includes(stage)) {
      return NextResponse.json(
        { ok: false, error: "A customer only sees a trip once it's booked." },
        { status: 409 }
      );
    }
    householdId = trip.household_id as string;
    next = `/portal/trips/${trip.id as string}`;
    emailKind = "trip_booked";
    destination = (trip.destination as string | null) ?? null;
    departDate = (trip.depart_date as string | null) ?? null;
    returnDate = (trip.return_date as string | null) ?? null;
  }

  // ─── Who to write to ──────────────────────────────────────────────────
  const recipient = await householdRecipient(supabase, agencyId, householdId);
  if (!recipient) {
    return NextResponse.json(
      { ok: false, error: "Nobody in this household has an email address on file." },
      { status: 409 }
    );
  }

  const { data: agency } = await supabase
    .from("agencies")
    .select("name")
    .eq("id", agencyId)
    .maybeSingle();

  const link = await createPortalLink(
    supabase,
    {
      agencyId,
      householdId,
      contactId: recipient.contactId,
      email: recipient.email,
      next,
    },
    request.url
  );
  if (!link) {
    return NextResponse.json({ ok: false, error: "Could not build the link." }, { status: 500 });
  }

  const outcome = await sendPortalEmail({
    supabase,
    agencyId,
    kind: emailKind,
    link,
    toContactId: recipient.contactId,
    householdId,
    agencyName: (agency?.name as string | undefined) || "Your travel agent",
    firstName: recipient.firstName || null,
    destination,
    departDate,
    returnDate,
    price,
    currency,
  });

  if (!outcome.ok) {
    const status = outcome.reason === "refused" ? 409 : outcome.reason === "not_configured" ? 503 : 502;
    return NextResponse.json({ ok: false, error: outcome.error }, { status });
  }

  return NextResponse.json({ ok: true, sentTo: outcome.to, kind: emailKind });
}
