/**
 * POST /api/contacts/[id]/consent
 *
 * Records a consent change for one contact on one channel — a new row in the
 * append-only ledger, never an update. The blueprint's rule (§3): every
 * change records its source, wording, date and evidence.
 *
 * Side effects:
 *   - email channel keeps the legacy contacts.marketing_opt_in flag in sync
 *     (older surfaces still read it; the ledger is authoritative),
 *   - `consent.updated` goes on the event spine (it's in the blueprint's
 *     shared-loop event list — Luna Marketing needs to hear about opt-outs),
 *   - a timeline interaction on the household, so the 360 shows when and how
 *     consent changed.
 *
 * Agency-scoped throughout.
 */

import { NextResponse } from "next/server";
import { createClient, AGENCY_ID } from "@/lib/supabase/server";
import { CONSENT_CHANNELS, type ConsentChannel } from "@/lib/consent/state";
import { emitEvent } from "@/lib/events/emit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SOURCES = new Set([
  "webform",
  "verbal",
  "email_reply",
  "preference_centre",
  "import",
  "agent_recorded",
]);

const str = (v: unknown, max: number): string | null =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const contactId = params.id;
  if (!contactId || !UUID_RE.test(contactId)) {
    return NextResponse.json({ ok: false, error: "Invalid contact id" }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const channel =
    typeof body.channel === "string" &&
    (CONSENT_CHANNELS as readonly string[]).includes(body.channel)
      ? (body.channel as ConsentChannel)
      : null;
  if (!channel) {
    return NextResponse.json({ ok: false, error: "Unknown channel" }, { status: 400 });
  }

  if (typeof body.granted !== "boolean") {
    return NextResponse.json(
      { ok: false, error: "granted must be true or false" },
      { status: 400 }
    );
  }
  const granted = body.granted;

  const source =
    typeof body.source === "string" && SOURCES.has(body.source)
      ? body.source
      : "agent_recorded";
  const wording = str(body.wording, 500);
  const evidence = str(body.evidence, 300);

  const supabase = createClient();

  const { data: contact } = await supabase
    .from("contacts")
    .select("id, household_id, first_name, last_name")
    .eq("id", contactId)
    .eq("agency_id", AGENCY_ID)
    .maybeSingle();

  if (!contact) {
    return NextResponse.json({ ok: false, error: "Contact not found" }, { status: 404 });
  }

  const householdId = (contact as { household_id: string }).household_id;
  const nowIso = new Date().toISOString();

  const { data: created, error: insErr } = await supabase
    .from("consents")
    .insert({
      agency_id: AGENCY_ID,
      contact_id: contactId,
      household_id: householdId,
      channel,
      granted,
      source,
      wording,
      evidence,
      occurred_at: nowIso,
    })
    .select("id")
    .maybeSingle();

  if (insErr || !created) {
    const missingTable = insErr?.message?.includes("consents");
    return NextResponse.json(
      {
        ok: false,
        error: missingTable
          ? "The consents table isn't set up yet. Run supabase/migrations/20260723180000_consents.sql in Supabase, then try again."
          : insErr?.message ?? "Couldn't record the consent change",
      },
      { status: 500 }
    );
  }

  // Legacy flag sync for the email channel — the ledger stays authoritative.
  if (channel === "email") {
    await supabase
      .from("contacts")
      .update({
        marketing_opt_in: granted,
        marketing_opt_in_at: granted ? nowIso : null,
      })
      .eq("id", contactId)
      .eq("agency_id", AGENCY_ID);
  }

  await emitEvent(supabase, AGENCY_ID, {
    type: "consent.updated",
    subjectType: "contact",
    subjectId: contactId,
    householdId,
    payload: { channel, granted, source },
  });

  // Timeline entry — best-effort.
  try {
    const name = [
      (contact as { first_name: string }).first_name,
      (contact as { last_name: string | null }).last_name,
    ]
      .filter(Boolean)
      .join(" ");
    await supabase.from("interactions").insert({
      agency_id: AGENCY_ID,
      household_id: householdId,
      contact_id: contactId,
      kind: "system",
      direction: "internal",
      subject: `Consent ${granted ? "granted" : "withdrawn"}: ${channel}`,
      body_summary: `${name} ${granted ? "opted in to" : "opted out of"} ${channel} marketing (${source.replace(/_/g, " ")}).`,
      occurred_at: nowIso,
    });
  } catch {
    // Never fails the request.
  }

  return NextResponse.json({
    ok: true,
    id: (created as { id: string }).id,
    channel,
    granted,
    occurred_at: nowIso,
  });
}
