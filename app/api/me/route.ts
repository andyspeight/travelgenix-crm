/**
 * GET /api/me — who is actually signed in.
 *
 * The usability review found the app greeted every user of every agency as
 * "Andy Speight" — a hardcoded name in the sidebar and the dashboard. This is
 * the honest source: the signed-in Control identity, or a plain fallback when
 * Control is not configured (local dev, a fresh deploy).
 *
 * The sidebar fetches this once, the way it already fetches the inbox badge.
 * It returns a name, initials and role, never an id or an email domain that
 * would leak more than a greeting needs.
 */

import { NextResponse } from "next/server";
import { controlIdentity } from "@/lib/auth/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** "andy.speight@x.io" → "Andy Speight"; "bookings" → "Bookings". */
function nameFromEmail(email: string): string {
  const local = email.split("@")[0] ?? "";
  const words = local.split(/[._-]+/).filter(Boolean);
  if (words.length === 0) return "There";
  return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] ?? "" : "";
  return (first + last).toUpperCase();
}

export async function GET() {
  const identity = await controlIdentity();

  if (!identity) {
    // No Control on this deployment. Say so plainly rather than invent a
    // person — a neutral label is honest where a name would be a guess.
    return NextResponse.json({
      ok: true,
      signedIn: false,
      firstName: "there",
      name: "Your workspace",
      initials: "·",
      role: null,
    });
  }

  const full = (identity.fullName ?? "").trim() || nameFromEmail(identity.email);
  const firstName = full.split(/\s+/)[0] || "there";

  return NextResponse.json({
    ok: true,
    signedIn: true,
    firstName,
    name: full,
    initials: initialsOf(full),
    role: identity.role,
    agencyName: identity.clientName ?? null,
  });
}
