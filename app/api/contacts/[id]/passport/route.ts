/**
 * The passport number's only door.
 *
 *   PUT    /api/contacts/[id]/passport   store or replace  (audited 'set')
 *   POST   /api/contacts/[id]/passport   reveal            (audited 'reveal')
 *   DELETE /api/contacts/[id]/passport   remove            (audited 'clear')
 *
 * Reveal is a POST rather than a GET on purpose: a GET would land the most
 * sensitive field in the CRM in browser history, in server access logs and in
 * any proxy between the two, and would be reachable by a link someone could be
 * tricked into following. A POST is none of those things.
 *
 * Agency-scoped through the agent's own session; the number is never included
 * in any other response, and never written to a log line.
 */

import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth/session";
import { enforceRateLimit, clientKey } from "@/lib/ai/rate-limit";
import { logSecurityEvent } from "@/lib/security/log";
import {
  clearPassportNumber,
  revealPassportNumber,
  setPassportNumber,
  type PassportActor,
} from "@/lib/passports/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function context(request: Request, id: string) {
  if (!UUID_RE.test(id ?? "")) {
    return { error: NextResponse.json({ ok: false, error: "Invalid traveller id" }, { status: 400 }) };
  }
  const session = await getSession();
  if (!session) {
    return { error: NextResponse.json({ ok: false, error: "No access to this workspace." }, { status: 403 }) };
  }
  const h = headers();
  const actor: PassportActor = {
    email: session.control?.email ?? null,
    ip: h.get("x-vercel-forwarded-for") || h.get("x-real-ip") || null,
  };
  return { agencyId: session.agencyId, actor, supabase: createClient() };
}

/** A tight cap: this is the field an attacker with a session would enumerate. */
async function limited(request: Request, route: string) {
  const limit = await enforceRateLimit(clientKey(request, route), 10, 60_000);
  return limit.ok
    ? null
    : NextResponse.json(
        { ok: false, error: "Too many attempts. Please wait a moment." },
        { status: 429, headers: { "retry-after": String(limit.retryAfter) } }
      );
}

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  const capped = await limited(request, "passport-write");
  if (capped) return capped;

  const ctx = await context(request, params.id);
  if ("error" in ctx) return ctx.error;

  let body: { passport_number?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }
  if (typeof body.passport_number !== "string") {
    return NextResponse.json({ ok: false, error: "A passport number is required." }, { status: 400 });
  }

  const result = await setPassportNumber(ctx.supabase, {
    agencyId: ctx.agencyId,
    contactId: params.id,
    value: body.passport_number,
    actor: ctx.actor,
  });
  if (!result.ok) {
    const status =
      result.reason === "invalid" ? 400 : result.reason === "not_found" ? 404 : result.reason === "not_configured" ? 503 : 502;
    return NextResponse.json({ ok: false, error: result.error }, { status });
  }
  return NextResponse.json({ ok: true, onFile: true });
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const capped = await limited(request, "passport-reveal");
  if (capped) return capped;

  const ctx = await context(request, params.id);
  if ("error" in ctx) {
    logSecurityEvent("auth.access.rejected", {
      route: "/api/contacts/[id]/passport",
      note: "passport reveal without a session",
    });
    return ctx.error;
  }

  const result = await revealPassportNumber(ctx.supabase, {
    agencyId: ctx.agencyId,
    contactId: params.id,
    actor: ctx.actor,
  });
  if (!result.ok) {
    const status = result.reason === "not_found" || result.reason === "absent" ? 404 : 502;
    return NextResponse.json({ ok: false, error: result.error }, { status });
  }
  // no-store: this response must not sit in any cache, at any hop.
  return NextResponse.json(
    { ok: true, passport_number: result.value, masked: result.masked },
    { headers: { "cache-control": "no-store, no-cache, must-revalidate, private" } }
  );
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const capped = await limited(request, "passport-write");
  if (capped) return capped;

  const ctx = await context(request, params.id);
  if ("error" in ctx) return ctx.error;

  const result = await clearPassportNumber(ctx.supabase, {
    agencyId: ctx.agencyId,
    contactId: params.id,
    actor: ctx.actor,
  });
  if (!result.ok) {
    const status = result.reason === "not_found" ? 404 : 502;
    return NextResponse.json({ ok: false, error: result.error }, { status });
  }
  return NextResponse.json({ ok: true, onFile: false });
}
