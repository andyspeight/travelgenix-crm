/**
 * Fetching a Travelify order for a trip, the way the My Booking widget does.
 *
 * The CRM never holds Travelify credentials and never reads Control's
 * Airtable (see lib/auth/control.ts for why). Instead it calls Control's own
 * /api/retrieve-order server-to-server with the platform's internal key,
 * naming the agency by its Control Clients record id. Control resolves that
 * client's Travelify credentials, calls Travelify with the same lookup
 * triplet the widget uses (email + departure date + booking reference), and
 * returns the same trimmed, sanitised order. One implementation for the
 * widget, the booking email, the PDF and the portal.
 *
 * Fail quiet: any problem is "unavailable" for the traveller, never an error
 * that reveals anything, and never a blocked page.
 */

import type { TravelifyOrder } from "./balance";

export type OrderLookup = {
  clientRecordId: string;
  emailAddress: string;
  departDate: string;
  orderRef: string;
  /** The traveller's IP, forwarded so Control rate-limits the person, not the CRM. */
  ip?: string | null;
  /** Wall-clock budget for the call; the home page uses a shorter one. */
  timeoutMs?: number;
};

export type OrderResult =
  | { ok: true; order: TravelifyOrder }
  | { ok: false; reason: "not_configured" | "invalid" | "not_found" | "unavailable" };

const REC_RE = /^rec[A-Za-z0-9]{14}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const REF_RE = /^[A-Z0-9_-]{3,40}$/;

const TIMEOUT_MS = 8000;

/** Control's base URL and the shared internal key: both, or the feature is off. */
export function travelifyConfigured(): boolean {
  return Boolean(process.env.CONTROL_BASE_URL && process.env.TG_INTERNAL_KEY);
}

// A short positive cache: a traveller opening the home page and then the trip
// page should not hit Travelify twice in the same minute.
const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { at: number; order: TravelifyOrder }>();

export async function fetchTravelifyOrder(args: OrderLookup): Promise<OrderResult> {
  if (!travelifyConfigured()) return { ok: false, reason: "not_configured" };

  const clientRecordId = args.clientRecordId.trim();
  const emailAddress = args.emailAddress.trim().toLowerCase();
  const departDate = args.departDate.trim();
  const orderRef = args.orderRef.trim().toUpperCase();
  if (
    !REC_RE.test(clientRecordId) ||
    !EMAIL_RE.test(emailAddress) ||
    !DATE_RE.test(departDate) ||
    !REF_RE.test(orderRef)
  ) {
    return { ok: false, reason: "invalid" };
  }

  const key = `${clientRecordId}|${orderRef}|${departDate}|${emailAddress}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return { ok: true, order: hit.order };

  const base = (process.env.CONTROL_BASE_URL as string).replace(/\/$/, "");
  let res: Response;
  try {
    res = await fetch(`${base}/api/retrieve-order`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-tg-internal-key": process.env.TG_INTERNAL_KEY as string,
        ...(args.ip ? { "x-tg-real-ip": args.ip } : {}),
      },
      body: JSON.stringify({ clientRecordId, emailAddress, departDate, orderRef }),
      signal: AbortSignal.timeout(args.timeoutMs ?? TIMEOUT_MS),
      cache: "no-store",
    });
  } catch {
    return { ok: false, reason: "unavailable" };
  }

  if (res.status === 404) return { ok: false, reason: "not_found" };
  if (!res.ok) return { ok: false, reason: "unavailable" };

  let body: { order?: TravelifyOrder } | null = null;
  try {
    body = (await res.json()) as { order?: TravelifyOrder };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
  const order = body?.order;
  if (!order || typeof order !== "object" || order.id == null) {
    return { ok: false, reason: "not_found" };
  }

  if (cache.size > 500) cache.clear();
  cache.set(key, { at: Date.now(), order });
  return { ok: true, order };
}
