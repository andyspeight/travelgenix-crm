/**
 * PATCH /api/portal/details — a traveller correcting their own details.
 *
 * Body: any of { phone, dietary, address_line1, address_line2, city, county,
 * postcode }. Phone and dietary land on the SIGNED-IN contact; the address
 * lives on the household, so it changes for everyone in it (which is what a
 * household address means).
 *
 * The session decides who is written to, never the request: the contact id
 * and household id come from the verified cookie, so a customer can only ever
 * edit their own row and their own household. Name, date of birth and
 * passport details are not accepted here at all — they have to match travel
 * documents (lib/portal/self-service).
 *
 * The change is recorded on the CRM timeline so the agent sees it happened.
 * WHICH fields moved, not what to: dietary needs are health information, and
 * the current value already lives on the contact record.
 */

import { NextResponse } from "next/server";
import { enforceRateLimit, clientKey } from "@/lib/ai/rate-limit";
import { portalEnabled } from "@/lib/portal/session";
import { readPortalSession } from "@/lib/portal/require";
import { createPortalClient } from "@/lib/portal/client";
import { validateSelfService } from "@/lib/portal/self-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function PATCH(request: Request) {
  if (!portalEnabled()) {
    return NextResponse.json({ ok: false, error: "Not available" }, { status: 404 });
  }
  const session = await readPortalSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "Please sign in again." }, { status: 401 });
  }

  const limit = await enforceRateLimit(clientKey(request, "portal-details"), 20, 60_000);
  if (!limit.ok) {
    return NextResponse.json(
      { ok: false, error: "Too many changes just now. Please wait a moment." },
      { status: 429, headers: { "retry-after": String(limit.retryAfter) } }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });
  }

  const validated = validateSelfService(body);
  if (!validated.ok) {
    return NextResponse.json({ ok: false, error: validated.error }, { status: 400 });
  }
  const { contact, household, changed } = validated.patch;

  const supabase = createPortalClient();
  const nowIso = new Date().toISOString();

  if (Object.keys(contact).length > 0) {
    const { error } = await supabase
      .from("contacts")
      .update({ ...contact, updated_at: nowIso })
      .eq("agency_id", session.agencyId)
      .eq("household_id", session.householdId)
      .eq("id", session.contactId);
    if (error) {
      console.error("[portal] details update failed:", error.message);
      return NextResponse.json({ ok: false, error: "That didn't save. Please try again." }, { status: 502 });
    }
  }

  if (Object.keys(household).length > 0) {
    const { error } = await supabase
      .from("households")
      .update({ ...household, updated_at: nowIso })
      .eq("agency_id", session.agencyId)
      .eq("id", session.householdId);
    if (error) {
      console.error("[portal] address update failed:", error.message);
      return NextResponse.json({ ok: false, error: "That didn't save. Please try again." }, { status: 502 });
    }
  }

  // Tell the agent it happened. Best-effort: the change itself has landed.
  try {
    await supabase.from("interactions").insert({
      agency_id: session.agencyId,
      household_id: session.householdId,
      contact_id: session.contactId,
      kind: "system",
      direction: "internal",
      subject: "Customer updated their details in the portal",
      body_summary: `Changed: ${changed.join(", ")}. The current values are on their record.`,
      occurred_at: nowIso,
    });
  } catch {
    // The timeline never fails the request.
  }

  return NextResponse.json({ ok: true, changed });
}
