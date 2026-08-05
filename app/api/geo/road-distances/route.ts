/**
 * POST /api/geo/road-distances
 *
 * Body: { source: {lat,lng}, airports: [{iata,lat,lng}, …] }
 * Returns driving distance + time from the customer to each airport, keyed by
 * IATA. Powers the "by road" figures on the 360 Location panel, alongside the
 * straight-line distances the client already computes.
 *
 * The OpenRouteService key is a secret, so the call is made here rather than in
 * the browser. Session-gated and rate-limited like the other request-path work.
 * When ORS isn't configured (no key) or errors, we answer ok:false and the
 * panel simply keeps showing straight-line only — road figures are additive.
 */

import { NextResponse } from "next/server";
import { apiAgencyId } from "@/lib/auth/session";
import { enforceRateLimit, clientKey } from "@/lib/ai/rate-limit";
import { roadDistances, type Point } from "@/lib/geo/road-matrix";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_AIRPORTS = 8;

const isLat = (v: unknown): v is number => typeof v === "number" && v >= -90 && v <= 90;
const isLng = (v: unknown): v is number => typeof v === "number" && v >= -180 && v <= 180;

export async function POST(request: Request) {
  const agencyId = await apiAgencyId();
  if (!agencyId) {
    return NextResponse.json({ ok: false, error: "No access" }, { status: 403 });
  }

  const rl = await enforceRateLimit(clientKey(request, "road-distances"), 30, 60_000);
  if (!rl.ok) {
    return NextResponse.json({ ok: false, error: "Too many requests" }, { status: 429 });
  }

  const key = process.env.OPENROUTESERVICE_API_KEY?.trim();
  if (!key) {
    // Not configured — the panel falls back to straight-line only.
    return NextResponse.json({ ok: false, error: "Road distances not configured" });
  }

  let body: { source?: unknown; airports?: unknown };
  try {
    body = (await request.json()) as { source?: unknown; airports?: unknown };
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const src = body.source as { lat?: unknown; lng?: unknown } | undefined;
  if (!src || !isLat(src.lat) || !isLng(src.lng)) {
    return NextResponse.json({ ok: false, error: "Bad source" }, { status: 400 });
  }
  const source: Point = { lat: src.lat, lng: src.lng };

  const raw = Array.isArray(body.airports) ? body.airports.slice(0, MAX_AIRPORTS) : [];
  const airports = raw
    .map((a) => a as { iata?: unknown; lat?: unknown; lng?: unknown })
    .filter((a) => typeof a.iata === "string" && isLat(a.lat) && isLng(a.lng))
    .map((a) => ({ iata: a.iata as string, lat: a.lat as number, lng: a.lng as number }));

  if (airports.length === 0) {
    return NextResponse.json({ ok: false, error: "No valid airports" }, { status: 400 });
  }

  try {
    const legs = await roadDistances(key, source, airports);
    const byIata: Record<string, { miles: number | null; minutes: number | null }> = {};
    airports.forEach((a, i) => {
      byIata[a.iata] = legs[i] ?? { miles: null, minutes: null };
    });
    return NextResponse.json({ ok: true, legs: byIata });
  } catch (err) {
    console.error("[road-distances]", err instanceof Error ? err.message : err);
    // Degrade quietly — straight-line is still shown.
    return NextResponse.json({ ok: false, error: "Routing unavailable" });
  }
}
