/**
 * GET /api/address/lookup?postcode=LS1+4DY
 *
 * The address lookup behind the postcode box on the customer forms. It works
 * with NO configuration at all via postcodes.io — the free, government-backed
 * service that validates a postcode and returns its town and county (but no
 * street line). If an agency sets IDEAL_POSTCODES_API_KEY it upgrades silently
 * to Ideal Postcodes, which returns the full house-level list to pick from.
 *
 * The route never writes anything and never trusts the caller for more than a
 * postcode: it's agency-authed (so it isn't an open proxy), rate limited, and
 * fails closed with a readable message. Provider errors degrade — an Ideal
 * Postcodes hiccup falls back to the free area lookup rather than showing
 * nothing.
 */

import { NextResponse } from "next/server";
import { apiAgencyId } from "@/lib/auth/session";
import { enforceRateLimit, clientKey } from "@/lib/ai/rate-limit";
import {
  normalisePostcode,
  isValidUkPostcode,
  parsePostcodesIo,
  parseIdealPostcodes,
  type AddressSuggestion,
} from "@/lib/address/postcode";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const TIMEOUT_MS = 6000;

export async function GET(request: Request) {
  const agencyId = await apiAgencyId();
  if (!agencyId) {
    return NextResponse.json({ ok: false, error: "No access to this workspace." }, { status: 403 });
  }

  const limit = await enforceRateLimit(clientKey(request, "address"), 30, 60_000);
  if (!limit.ok) {
    return NextResponse.json(
      { ok: false, error: "Looking up a little too fast. Try again shortly." },
      { status: 429, headers: { "retry-after": String(limit.retryAfter) } }
    );
  }

  const raw = new URL(request.url).searchParams.get("postcode") ?? "";
  const postcode = normalisePostcode(raw);
  if (!isValidUkPostcode(postcode)) {
    return NextResponse.json(
      { ok: false, error: "That doesn't look like a UK postcode." },
      { status: 400 }
    );
  }

  // Preferred path: the keyed provider gives the full house-level list.
  const key = process.env.IDEAL_POSTCODES_API_KEY;
  if (key) {
    const viaKeyed = await fromIdealPostcodes(postcode, key);
    if (viaKeyed) return NextResponse.json(viaKeyed);
    // fall through to the free area lookup on any Ideal Postcodes failure
  }

  const viaFree = await fromPostcodesIo(postcode);
  if (viaFree) return NextResponse.json(viaFree);

  return NextResponse.json(
    { ok: false, error: "We couldn't find that postcode. You can still type the address in." },
    { status: 404 }
  );
}

type LookupResult = {
  ok: true;
  postcode: string;
  addresses: AddressSuggestion[];
  /** True when only the area is known (no street line) — the form asks for it. */
  partial: boolean;
  source: "ideal-postcodes" | "postcodes.io";
};

async function fromIdealPostcodes(postcode: string, key: string): Promise<LookupResult | null> {
  try {
    // The key goes in the query string per Ideal Postcodes' server-side usage;
    // it never reaches the browser and is never echoed in an error.
    // Both providers match on the space-less postcode in the path — the form
    // exactly the Ideal Postcodes docs use — so strip it rather than sending
    // an encoded space.
    const path = postcode.replace(/\s+/g, "");
    const url = `https://api.ideal-postcodes.co.uk/v1/postcodes/${encodeURIComponent(path)}?api_key=${encodeURIComponent(key)}`;
    const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) {
      // 404 is a genuine miss; 401/402/403 mean the key was refused (bad key,
      // exhausted balance, or a security restriction blocking server-side use).
      // Log the status — never the key — so a misconfigured key is diagnosable
      // in the server logs rather than silently degrading to the free lookup.
      if (res.status !== 404) console.warn(`[address] Ideal Postcodes refused the lookup (HTTP ${res.status})`);
      return null;
    }
    const json = (await res.json()) as unknown;
    const addresses = parseIdealPostcodes(json, postcode).filter((a) => a.line1 || a.city);
    if (addresses.length === 0) return null;
    return { ok: true, postcode, addresses, partial: false, source: "ideal-postcodes" };
  } catch (err) {
    // Timeout, network, or malformed JSON — let the caller fall back.
    console.warn("[address] Ideal Postcodes lookup errored:", err instanceof Error ? err.message : "unknown");
    return null;
  }
}

async function fromPostcodesIo(postcode: string): Promise<LookupResult | null> {
  try {
    const url = `https://api.postcodes.io/postcodes/${encodeURIComponent(postcode)}`;
    const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) return null;
    const json = (await res.json()) as unknown;
    const area = parsePostcodesIo(json, postcode);
    if (!area) return null;
    return { ok: true, postcode: area.postcode, addresses: [area], partial: true, source: "postcodes.io" };
  } catch {
    return null;
  }
}
