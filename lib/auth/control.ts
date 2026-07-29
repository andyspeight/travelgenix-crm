/**
 * Control — the Luna suite's shared sign-in, read by Luna Work.
 *
 * Control (the identity system in the tg-widgets repo, backed by the
 * Travelgenix auth base) is the single source of truth for who a person is,
 * which client (agency) they are working in, and which products they may
 * launch. Luna Work does NOT keep its own users, passwords or login screen —
 * it reads the same `tg_session` cookie every other Luna tool reads.
 *
 * HOW, and why this way:
 *
 *   We do not verify the JWT ourselves and we do not read Control's Airtable
 *   directly. Instead the server calls Control's own `GET /api/auth/me`,
 *   forwarding the caller's cookie. That keeps the signing secret and the
 *   identity schema in exactly one deployment, and means revocation,
 *   suspension, multi-company switching, entitlements and staff "act as" all
 *   behave here exactly as they do everywhere else in the suite — because it
 *   is literally the same code answering.
 *
 *   The cookie is scoped to `.travelify.io`, which is why Luna Work is served
 *   from crm.travelify.io. A server-to-server call with the cookie forwarded
 *   involves no CORS and no token in the browser.
 *
 * ACT AS: a staff member acting as a client sends `X-TG-Act-As` (per tab, per
 * tool — see the widgets repo's docs/act-as-scoping-spec.md). We forward the
 * header untouched so Control decides whether the grant is valid. We never
 * interpret it ourselves, so we cannot get it wrong in a way Control wouldn't.
 *
 * FAIL CLOSED: any doubt — no cookie, network error, non-200, malformed body,
 * missing product grant — resolves to "no session", never to a guessed one.
 */

export const CONTROL_PRODUCT_SLUG = "crm";

/** Roles Control issues per product, least to most privileged. */
export type ControlRole = "member" | "admin" | "owner";

export type ControlSession = {
  email: string;
  fullName: string;
  /** Control's Clients record id — the agency this session is working in. */
  clientRecordId: string;
  clientName: string;
  plan: string;
  /** The caller's role ON LUNA WORK specifically, not their account role. */
  role: ControlRole;
  isStaff: boolean;
};

/** The subset of Control's /api/auth/me body we rely on. */
type MeBody = {
  ok?: boolean;
  user?: { email?: string; fullName?: string };
  client?: { recordId?: string; clientName?: string; plan?: string; status?: string } | null;
  accessibleProducts?: { slug?: string; role?: string }[];
  isStaff?: boolean;
};

const ROLES: ControlRole[] = ["member", "admin", "owner"];

function asRole(raw: unknown): ControlRole {
  return ROLES.includes(raw as ControlRole) ? (raw as ControlRole) : "member";
}

/**
 * Turn a Control /api/auth/me body into a session for THIS product, or null.
 *
 * Pure and exported so the access rules are testable without a network: a
 * body only becomes a session when it is ok, carries a client, and grants
 * this product. Staff are trusted for the product grant (Control already
 * gives them every active product) but still need a resolved client — a
 * staff member who has not chosen an agency has nothing to scope data to.
 */
export function sessionFromMe(body: MeBody | null | undefined): ControlSession | null {
  if (!body || body.ok === false) return null;

  const clientRecordId = body.client?.recordId ?? "";
  if (!clientRecordId) return null;

  const grant = (body.accessibleProducts ?? []).find(
    (p) => p?.slug === CONTROL_PRODUCT_SLUG
  );
  const isStaff = body.isStaff === true;
  if (!grant && !isStaff) return null;

  return {
    email: body.user?.email ?? "",
    fullName: body.user?.fullName ?? "",
    clientRecordId,
    clientName: body.client?.clientName ?? "",
    plan: body.client?.plan ?? "",
    // Staff without an explicit grant act with owner rights, matching how
    // Control treats them on every other product.
    role: grant ? asRole(grant.role) : "owner",
    isStaff,
  };
}

/** Does this role clear the bar? Ordered, so "admin" satisfies "member". */
export function hasRole(session: ControlSession, atLeast: ControlRole): boolean {
  return ROLES.indexOf(session.role) >= ROLES.indexOf(atLeast);
}

/** True when Control integration is switched on for this deployment. */
export function controlConfigured(): boolean {
  return Boolean(process.env.CONTROL_BASE_URL);
}

// ─── Session resolution (I/O) ─────────────────────────────────────────

const TIMEOUT_MS = 5_000;
const CACHE_TTL_MS = 30_000; // mirrors Control's own permissions cache

type CacheEntry = { session: ControlSession | null; at: number };
const cache = new Map<string, CacheEntry>();
const MAX_CACHE = 500;

/**
 * Resolve the current Control session from the caller's headers.
 *
 * @param cookieHeader raw Cookie header (must carry tg_session)
 * @param actAsHeader  raw X-TG-Act-As header, forwarded untouched
 */
export async function resolveControlSession(
  cookieHeader: string | null,
  actAsHeader?: string | null
): Promise<ControlSession | null> {
  const base = process.env.CONTROL_BASE_URL;
  if (!base || !cookieHeader || !cookieHeader.includes("tg_session=")) return null;

  // Cache on the exact credentials presented: a different cookie or a
  // different act-as grant is a different session, never a cache hit.
  const key = `${cookieHeader}|${actAsHeader ?? ""}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.session;

  let session: ControlSession | null = null;
  try {
    const res = await fetch(`${base.replace(/\/$/, "")}/api/auth/me`, {
      headers: {
        cookie: cookieHeader,
        ...(actAsHeader ? { "X-TG-Act-As": actAsHeader } : {}),
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    if (res.ok) session = sessionFromMe((await res.json()) as MeBody);
  } catch {
    // Control unreachable — fail closed. Never invent a session.
    session = null;
  }

  if (cache.size > MAX_CACHE) cache.clear();
  cache.set(key, { session, at: Date.now() });
  return session;
}
