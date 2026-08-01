/**
 * POST /api/email/improve — Luna rewrites what the agent wrote.
 *
 * Body: { text, mode }  mode: polish | spelling | shorter | warmer | formal
 *
 * THE RULE: it edits, it does not author. No price, date, time, link or
 * promise may appear in the rewrite that was not in the draft. The prompt
 * says so (lib/email/improve), and then this route CHECKS it: every number,
 * link and address in the rewrite is compared with the draft, and anything
 * new comes back named, with the rewrite marked as not safe to apply in one
 * click. The agent still sees it — they may have meant it — but nothing
 * invented reaches a customer because a button was convenient.
 *
 * Writes nothing. The rewrite is a suggestion the agent accepts or discards
 * in the composer, exactly like the extract route: the CRM never changes
 * anything on the model's say-so.
 *
 * Same house rules as every AI route: server-side key, the draft in the user
 * turn only, an injection decline clause, a token cap, rate limited, fails
 * closed with a readable error.
 */

import { NextResponse } from "next/server";
import { enforceRateLimit, clientKey } from "@/lib/ai/rate-limit";
import { apiAgencyId } from "@/lib/auth/session";
import {
  buildImproveSystem,
  checkRewrite,
  repairHouseStyle,
  hasBlocking,
  type ImproveMode,
} from "@/lib/email/improve";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MODEL = "claude-haiku-4-5"; // editing prose is Haiku work
const MAX_OUTPUT_TOKENS = 1500;
const ANTHROPIC_VERSION = "2023-06-01";
const MAX_INPUT_CHARS = 6000;

const MODES = new Set<ImproveMode>(["polish", "spelling", "shorter", "warmer", "formal"]);

export async function POST(request: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { ok: false, error: "Luna's writing help isn't configured on this workspace." },
      { status: 503 }
    );
  }

  // Signed in, like every other authenticated surface.
  const agencyId = await apiAgencyId();
  if (!agencyId) {
    return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });
  }

  const limit = await enforceRateLimit(clientKey(request, "email-improve"), 20, 60_000);
  if (!limit.ok) {
    return NextResponse.json(
      { ok: false, error: "That's a lot of rewrites in a minute. Give it a moment." },
      { status: 429, headers: { "retry-after": String(limit.retryAfter) } }
    );
  }

  let body: { text?: unknown; mode?: unknown };
  try {
    body = (await request.json()) as { text?: unknown; mode?: unknown };
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const text = typeof body.text === "string" ? body.text.trim() : "";
  const mode = (typeof body.mode === "string" ? body.mode : "polish") as ImproveMode;
  if (text.length < 15) {
    return NextResponse.json(
      { ok: false, error: "Write a sentence or two first, then Luna can help with the wording." },
      { status: 400 }
    );
  }
  if (!MODES.has(mode)) {
    return NextResponse.json({ ok: false, error: "Unknown rewrite mode." }, { status: 400 });
  }

  const input = text.slice(0, MAX_INPUT_CHARS);

  let rewritten: string;
  try {
    rewritten = await improve(apiKey, input, mode);
  } catch (err) {
    console.error("[email/improve] failed:", err);
    return NextResponse.json(
      { ok: false, error: "Couldn't rewrite that just now. Your draft is untouched." },
      { status: 502 }
    );
  }

  if (!rewritten) {
    return NextResponse.json(
      { ok: false, error: "Luna had nothing to add. Your draft is untouched." },
      { status: 502 }
    );
  }

  // Em dashes are repaired rather than reported: the fix is unambiguous.
  const cleaned = repairHouseStyle(rewritten);
  const issues = checkRewrite(input, cleaned);

  return NextResponse.json({
    ok: true,
    original: input,
    rewritten: cleaned,
    issues,
    safe: !hasBlocking(issues),
  });
}

async function improve(apiKey: string, text: string, mode: ImproveMode): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    signal: AbortSignal.timeout(25_000),
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: MAX_OUTPUT_TOKENS,
      system: buildImproveSystem(mode),
      messages: [
        {
          role: "user",
          content: `Here is the draft email to edit. Return only the edited text.\n\n<draft>\n${text}\n</draft>`,
        },
      ],
    }),
    cache: "no-store",
  });

  if (!res.ok) throw new Error(`Anthropic ${res.status}`);
  const data = (await res.json()) as { content?: { type?: string; text?: string }[] };
  const out = (data.content ?? [])
    .filter((c) => c.type === "text")
    .map((c) => c.text ?? "")
    .join("")
    .trim();

  // Models sometimes wrap prose in fences even when told not to.
  return out.replace(/^```[a-z]*\n?/i, "").replace(/\n?```$/, "").trim();
}
