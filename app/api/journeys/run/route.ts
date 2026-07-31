/**
 * POST /api/journeys/run — "Run now", pressed by a person.
 *
 * Body: { journeyId?: string }. With an id, runs that one journey; without,
 * every active journey for the caller's agency.
 *
 * The work itself lives in lib/journeys/run so that this and the nightly
 * schedule are the same code rather than two implementations that drift.
 * This route's only job is to establish WHO is asking and hand off.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { apiAgencyId } from "@/lib/auth/session";
import { runJourneysForAgency } from "@/lib/journeys/run";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  let journeyId: string | undefined;
  const raw = await request.text();
  if (raw.trim()) {
    try {
      const parsed = JSON.parse(raw) as { journeyId?: unknown };
      if (typeof parsed.journeyId === "string") {
        if (!UUID_RE.test(parsed.journeyId)) {
          return NextResponse.json({ ok: false, error: "Invalid journey id" }, { status: 400 });
        }
        journeyId = parsed.journeyId;
      }
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
    }
  }

  const supabase = createClient();
  const agencyId = await apiAgencyId();
  if (!agencyId) {
    return NextResponse.json(
      { ok: false, error: "No access to this workspace." },
      { status: 403 }
    );
  }

  const result = await runJourneysForAgency(supabase, agencyId, journeyId);
  if (result.error) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 500 });
  }
  return NextResponse.json({ ok: true, totalFired: result.totalFired, ran: result.ran });
}
