/**
 * POST /api/portal/request-link — "email me a link to see my trips".
 *
 * Body: { email, agency? }. For every contact whose email matches, we mint a
 * single-use token and email a login link from that agency. From a branded
 * /portal/<slug> screen the request carries that agency's slug and only its
 * match is used, so the link and the email are that agency's. Two things keep this from
 * leaking who is a customer:
 *
 *   1. The response is ALWAYS the same generic success, whatever happens.
 *   2. Every response is padded to a FIXED floor, so a match (which does more
 *      work and a provider round-trip) takes the same wall-clock time as a
 *      miss. Without the pad, the identical body would still be given away by
 *      response latency.
 *
 * Emails only ever go to addresses already on file, so this can't be used to
 * spam arbitrary people. Rate-limited per (platform-trusted) client IP.
 *
 * Public (allow-listed in middleware): a traveller has no session yet.
 */

import { NextResponse } from "next/server";
import { enforceRateLimit, clientKey } from "@/lib/ai/rate-limit";
import { portalEnabled } from "@/lib/portal/session";
import { createPortalClient } from "@/lib/portal/client";
import { AGENCY_SLUG_RE, findAgencyBySlug, findContactsByEmail } from "@/lib/portal/lookup";
import { portalBaseUrl } from "@/lib/portal/invite";
import { createLoginToken } from "@/lib/portal/token";
import { sendLoginLink } from "@/lib/portal/mailer";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Every real response takes at least this long, to hide the match/miss delta. */
const FLOOR_MS = 700;

/** Always the same answer, so the endpoint never reveals whether an email exists. */
function generic() {
  return NextResponse.json({
    ok: true,
    message: "If that email is on file, we've sent a link to view your trips.",
  });
}

async function floor(start: number) {
  const wait = FLOOR_MS - (Date.now() - start);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
}

export async function POST(request: Request) {
  if (!portalEnabled()) {
    return NextResponse.json({ ok: false, error: "Not available" }, { status: 404 });
  }

  const limit = await enforceRateLimit(clientKey(request, "portal-link"), 5, 60_000);
  if (!limit.ok) {
    return NextResponse.json(
      { ok: false, error: "Too many requests. Please wait a moment." },
      { status: 429, headers: { "retry-after": String(limit.retryAfter) } }
    );
  }

  const start = Date.now();
  let email = "";
  let slug = "";
  try {
    const body = (await request.json()) as { email?: unknown; agency?: unknown };
    email = typeof body.email === "string" ? body.email.trim() : "";
    slug = typeof body.agency === "string" ? body.agency.trim().toLowerCase() : "";
    if (!AGENCY_SLUG_RE.test(slug)) slug = "";
  } catch {
    // Fall through: a malformed body gets the same padded generic answer.
  }

  if (email && email.includes("@")) {
    // Best-effort behind the generic response + fixed floor: a slow or failed
    // provider never tells the caller whether the email exists.
    try {
      const supabase = createPortalClient();
      let matches = await findContactsByEmail(supabase, email);
      if (slug) {
        // A branded screen only ever signs people in to that agency.
        const agency = await findAgencyBySlug(supabase, slug);
        matches = agency ? matches.filter((m) => m.agencyId === agency.agencyId) : [];
      }
      const base = portalBaseUrl(request.url);
      for (const m of matches) {
        const token = await createLoginToken(supabase, {
          agencyId: m.agencyId,
          householdId: m.householdId,
          contactId: m.contactId,
          email: m.email,
        });
        const link = `${base}/api/portal/auth?token=${token}${slug ? `&a=${slug}` : ""}`;
        const name = [m.firstName, m.lastName].filter(Boolean).join(" ") || null;
        await sendLoginLink(supabase, { agencyId: m.agencyId, toEmail: m.email, toName: name, link });
      }
    } catch {
      // Swallow: the caller always gets the same answer.
    }
  }

  await floor(start);
  return generic();
}
