/**
 * POST /api/ask
 *
 * The Luna Ask endpoint. Takes a plain-English question, runs the router
 * (tool selection -> query -> insight), returns the structured answer.
 *
 * Security: key server-side, agency-scoped context, question length-capped,
 * fails closed, best-effort in-memory rate limit (per-instance — swap for
 * Upstash before heavy client-facing use, same as the other AI routes).
 */

import { NextResponse } from "next/server";
import { createClient, AGENCY_ID } from "@/lib/supabase/server";
import { runAsk, type AskTurn } from "@/lib/ask/router";
import type { QueryContext } from "@/lib/ask/contract";
import { rateLimit, clientKey } from "@/lib/ai/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_Q = 400;

export async function POST(request: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ ok: false, error: "Luna Ask is not configured yet." }, { status: 503 });
  }

  const limit = rateLimit(clientKey(request, "ask"), 20, 60_000);
  if (!limit.ok) {
    return NextResponse.json(
      { ok: false, error: "Too many questions just now. Give it a moment." },
      { status: 429, headers: { "retry-after": String(limit.retryAfter) } }
    );
  }

  const body = await request.json().catch(() => null);
  const qRaw = (body as { question?: unknown })?.question;
  if (typeof qRaw !== "string" || !qRaw.trim()) {
    return NextResponse.json({ ok: false, error: "Ask a question." }, { status: 400 });
  }
  const question = qRaw.trim().slice(0, MAX_Q);

  // Optional follow-up context: prior turns, tightly capped so a hostile or
  // runaway client can't inflate the prompt.
  const rawHistory = (body as { history?: unknown })?.history;
  const history: AskTurn[] = Array.isArray(rawHistory)
    ? rawHistory
        .filter(
          (t): t is { q: string; a: string } =>
            !!t && typeof (t as AskTurn).q === "string" && typeof (t as AskTurn).a === "string"
        )
        .slice(-4)
        .map((t) => ({ q: t.q.slice(0, MAX_Q), a: t.a.slice(0, 600) }))
    : [];

  const supabase = createClient();
  const ctx: QueryContext = {
    agencyId: AGENCY_ID,
    db: supabase as unknown as QueryContext["db"],
    now: new Date(),
  };

  const answer = await runAsk(question, ctx, apiKey, history);
  return NextResponse.json(answer, { status: answer.ok ? 200 : 502 });
}
