/**
 * POST /api/ask
 *
 * The Luna Ask endpoint. Takes a plain-English question, runs the router
 * (tool selection -> query -> insight), returns the structured answer.
 *
 * Security: key server-side, agency-scoped context, question length-capped,
 * fails closed. NOTE: no rate limit yet — fine for internal agent use, but
 * this is on the list to add (Upstash) before any client-facing use, same as
 * the other AI routes.
 */

import { NextResponse } from "next/server";
import { createClient, AGENCY_ID } from "@/lib/supabase/server";
import { runAsk } from "@/lib/ask/router";
import type { QueryContext } from "@/lib/ask/contract";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_Q = 400;

export async function POST(request: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ ok: false, error: "Luna Ask is not configured yet." }, { status: 503 });
  }

  const body = await request.json().catch(() => null);
  const qRaw = (body as { question?: unknown })?.question;
  if (typeof qRaw !== "string" || !qRaw.trim()) {
    return NextResponse.json({ ok: false, error: "Ask a question." }, { status: 400 });
  }
  const question = qRaw.trim().slice(0, MAX_Q);

  const supabase = createClient();
  const ctx: QueryContext = {
    agencyId: AGENCY_ID,
    db: supabase as unknown as QueryContext["db"],
    now: new Date(),
  };

  const answer = await runAsk(question, ctx, apiKey);
  return NextResponse.json(answer, { status: answer.ok ? 200 : 502 });
}
