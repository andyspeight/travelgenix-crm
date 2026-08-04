/**
 * POST /api/widget/lead — the signed front door for a website lead.
 *
 * A tg-widgets enquiry form has no Control sign-in, so it can't post to
 * /api/enquiries like the in-app form does. This endpoint authenticates the
 * way the email webhook does — a shared secret checked in the route — but
 * leads are PER AGENCY, so the credential is per agency too:
 *
 *   X-Travelgenix-Key        the agency's public lead_ingest_key (wlk_…). Names
 *                            which agency the lead belongs to. Safe to sit in
 *                            the widget config.
 *   X-Travelgenix-Signature  t={unix},v1={hmac} over `${t}.${rawBody}`, signed
 *                            with the agency's lead_ingest_secret. Proves the
 *                            body is untampered and came from that agency's
 *                            configured widget, and stops replays (5-min window).
 *
 * The middleware lets this path through the access gate (a browser widget
 * can't hold a login cookie); the key+signature check below is the whole
 * authorisation. An agency that hasn't turned lead capture on (no key, or a
 * key with no secret) is refused, as is any request whose HMAC doesn't verify.
 *
 * Once verified, the lead goes through the SAME create core as a hand-typed
 * enquiry (lib/enquiries/create) so it is scored, put on the response clock,
 * deduped against existing customers and given its timeline entry identically.
 * Only the source is pinned to "website" and any marketing-consent block is
 * recorded on the enquiry note (v1 — a fuller consent ledger comes later).
 */

import { NextResponse } from "next/server";
import { createSystemClient } from "@/lib/supabase/server";
import { verifySignature } from "@/lib/widget/signature";
import { normaliseEnquiryFields, createEnquiry } from "@/lib/enquiries/create";
import { enforceRateLimit, clientKey } from "@/lib/ai/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const KEY_RE = /^wlk_[a-z0-9]{8,64}$/i;

/** A short, opaque acknowledgement — never leak whether a key/secret exists. */
const ACCEPTED = NextResponse.json({ ok: true });

export async function POST(request: Request) {
  // Rate-limit first, by IP, before any database work. A public endpoint is a
  // target; this caps a single source hammering it regardless of key validity.
  const rl = await enforceRateLimit(clientKey(request, "widget-lead"), 30, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { ok: false, error: "Too many requests" },
      { status: 429, headers: { "retry-after": String(rl.retryAfter) } }
    );
  }

  const key = request.headers.get("x-travelgenix-key")?.trim();
  const signature = request.headers.get("x-travelgenix-signature");
  if (!key || !KEY_RE.test(key)) {
    return NextResponse.json({ ok: false, error: "Missing or malformed key" }, { status: 401 });
  }

  // Raw body — the signature is over the exact bytes, so parse only after.
  const rawBody = await request.text();
  if (rawBody.length > 100_000) {
    return NextResponse.json({ ok: false, error: "Payload too large" }, { status: 413 });
  }

  // Resolve the agency from the public key. System client: a widget has no
  // session, and the key legitimately names an agency across the estate.
  const db = createSystemClient();
  const { data: agency } = await db
    .from("agencies")
    .select("id, lead_ingest_secret")
    .eq("lead_ingest_key", key)
    .maybeSingle();

  // Unknown key, or an agency that hasn't finished enabling capture (no
  // secret). Same 401 either way — don't reveal which.
  const secret = (agency as { id: string; lead_ingest_secret: string | null } | null)?.lead_ingest_secret;
  if (!agency || !secret) {
    return NextResponse.json({ ok: false, error: "Not authorised" }, { status: 401 });
  }
  const agencyId = (agency as { id: string }).id;

  const verified = verifySignature({ header: signature, rawBody, secret });
  if (!verified.ok) {
    return NextResponse.json({ ok: false, error: "Bad signature" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  // Honeypot: a hidden field only a bot fills. Accept-and-drop so the bot
  // learns nothing from the response, but write nothing.
  if (typeof body.hp === "string" && body.hp.trim().length > 0) {
    return ACCEPTED;
  }

  // A website lead is always source "website", whatever the payload claims.
  const consentNote = describeConsent(body.consent);
  const merged: Record<string, unknown> = {
    ...body,
    source: "website",
    notes: [consentNote, typeof body.notes === "string" ? body.notes : null]
      .filter(Boolean)
      .join("\n\n") || null,
  };

  const norm = normaliseEnquiryFields(merged);
  if (!norm.ok) {
    return NextResponse.json({ ok: false, error: norm.error }, { status: 400 });
  }

  const result = await createEnquiry(db, agencyId, norm.fields, norm.householdId);
  if (!result.ok) {
    // Log for the agency's operators; keep the response opaque to the widget.
    console.error(`[widget/lead] create failed for ${agencyId}: ${result.error}`);
    return NextResponse.json({ ok: false, error: "Couldn't record the lead" }, { status: 502 });
  }

  return NextResponse.json({ ok: true, id: result.id });
}

/**
 * Fold a marketing-consent block into a human-readable note so it lands on the
 * enquiry timeline. v1: consent lives as a note; a structured consent ledger
 * (auditable, per-channel) is a later milestone.
 */
function describeConsent(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return null;
  const c = raw as Record<string, unknown>;
  const email = c.marketing_email === true;
  const sms = c.marketing_sms === true;
  if (!email && !sms) return null;

  const channels = [email ? "email" : null, sms ? "SMS" : null].filter(Boolean).join(" and ");
  const when = typeof c.given_at === "string" && c.given_at.trim() ? c.given_at.trim().slice(0, 40) : null;
  const wording = typeof c.wording === "string" && c.wording.trim() ? c.wording.trim().slice(0, 500) : null;

  return [
    `Marketing consent given for ${channels}${when ? ` on ${when}` : ""} (via website widget).`,
    wording ? `Wording: "${wording}"` : null,
  ]
    .filter(Boolean)
    .join(" ");
}
