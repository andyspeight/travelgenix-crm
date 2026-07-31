/**
 * GET /api/health — is the app up, and can it reach its database?
 *
 * For an uptime monitor, which cannot sign in, so this is deliberately
 * reachable without a session. That makes what it returns a security
 * question, and the answer is: as little as possible.
 *
 * It says whether the app is serving and whether a trivial query succeeds.
 * It does NOT report counts, agency names, configuration, versions or which
 * integrations are wired — all of that is a map of the estate for anyone who
 * finds the URL, and all of it is already available to a signed-in admin on
 * the Settings page, which is where detail belongs.
 *
 * The query is a bare existence check against a reference table, chosen so a
 * health probe every minute costs nothing.
 */

import { NextResponse } from "next/server";
import { createSystemClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  let database: "up" | "down" = "down";
  try {
    const supabase = createSystemClient();
    const { error } = await supabase
      .from("agencies")
      .select("id", { count: "exact", head: true })
      .limit(1);
    if (!error) database = "up";
  } catch {
    database = "down";
  }

  // 503 when the database is unreachable, so a monitor treats it as an
  // outage rather than reading 200 and calling it healthy.
  return NextResponse.json(
    { ok: database === "up", database, time: new Date().toISOString() },
    {
      status: database === "up" ? 200 : 503,
      headers: { "cache-control": "no-store" },
    }
  );
}
