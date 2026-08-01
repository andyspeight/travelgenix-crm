/**
 * Engagement — what happened to a message after we handed it over.
 *
 * The CRM already knows what it SENT. This is the other half: delivered,
 * opened, clicked. It comes from the same shared provider webhook as bounces,
 * so the same rule applies — an event is ours only if its message id matches
 * a send we recorded.
 *
 * THE HONEST BIT, and it decides the wording everywhere downstream:
 *
 *   An OPEN IS NOT PROOF ANYONE READ IT. Apple Mail Privacy Protection
 *   fetches the tracking image for every message before the recipient sees
 *   it. Corporate security scanners do the same. Gmail proxies images. A
 *   large share of "opens" are machines. Software that reports "they read
 *   your email" is guessing, and an agent who chases on that basis looks
 *   foolish to a customer who genuinely never saw it.
 *
 *   A CLICK IS DIFFERENT. Scanners do follow links, but far less often, and
 *   a click is the closest thing to evidence a person engaged.
 *
 * So: opens are shown as a hint with the caveat attached, clicks as the
 * stronger signal, and NEITHER EVER STOPS A SEQUENCE. Only a real reply
 * does (lib/email/inbound.ts). Chasing someone who opened but did not answer
 * is exactly what a chase is for.
 *
 * Pure functions, no I/O.
 */

export type EngagementKind = "delivered" | "opened" | "clicked";

/** Provider event names → what they mean to us. Anything else is ignored. */
export const ENGAGEMENT: Record<string, EngagementKind> = {
  // SendGrid
  delivered: "delivered",
  open: "opened",
  click: "clicked",
  // Brevo
  opened: "opened",
  unique_opened: "opened",
  clicks: "clicked",
};

export type EngagementEvent = {
  kind: EngagementKind;
  messageId: string;
  /** ISO. The provider's own timestamp where it gave one. */
  at: string;
  url: string | null;
};

/** How many events we will consider from one delivery, as with bounces. */
export const MAX_EVENTS = 500;

type RawEngagement = {
  event?: unknown;
  sg_message_id?: unknown; // SendGrid: id + routing suffix after a dot
  ["message-id"]?: unknown; // Brevo
  timestamp?: unknown; // SendGrid: unix seconds
  ts_event?: unknown; // Brevo: unix seconds
  date?: unknown; // Brevo: "2026-08-01 09:14:22"
  url?: unknown;
};

/** The provider's timestamp, or null if it gave us nothing usable. */
function eventTime(raw: RawEngagement): string | null {
  const secs =
    typeof raw.timestamp === "number"
      ? raw.timestamp
      : typeof raw.ts_event === "number"
        ? raw.ts_event
        : null;
  if (secs && Number.isFinite(secs)) return new Date(secs * 1000).toISOString();

  if (typeof raw.date === "string") {
    const d = new Date(raw.date.replace(" ", "T"));
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  return null;
}

/**
 * Turn whatever the provider posted into engagement events, dropping
 * everything that is not one. `receivedAt` stands in when the provider sent
 * no timestamp of its own — better a slightly late time than no record.
 */
export function normaliseEngagement(payload: unknown, receivedAt: string): EngagementEvent[] {
  const list = Array.isArray(payload) ? payload : [payload];
  const out: EngagementEvent[] = [];

  for (const item of list.slice(0, MAX_EVENTS)) {
    const raw = (item ?? {}) as RawEngagement;
    const name = typeof raw.event === "string" ? raw.event : "";
    const kind = ENGAGEMENT[name];
    if (!kind) continue;

    const sgId = typeof raw.sg_message_id === "string" ? raw.sg_message_id : null;
    const brevoId = typeof raw["message-id"] === "string" ? raw["message-id"] : null;
    // SendGrid appends a routing suffix after the first dot; we stored the
    // bare X-Message-Id at send time, so strip back to it.
    const messageId = sgId ? sgId.split(".")[0] : brevoId;
    if (!messageId) continue;

    out.push({
      kind,
      messageId,
      at: eventTime(raw) ?? receivedAt,
      url: typeof raw.url === "string" ? raw.url.slice(0, 500) : null,
    });
  }
  return out;
}

/** The send rows an engagement fold reads and writes. */
export type EngagementRow = {
  id: string;
  provider_message_id: string;
  delivered_at?: string | null;
  first_opened_at?: string | null;
  open_count?: number | null;
  first_clicked_at?: string | null;
  click_count?: number | null;
  last_event_at?: string | null;
  /** Set by the inbound route when they answered this message. */
  replied_at?: string | null;
  /** sent | failed | bounced | complained — a failure outranks everything. */
  status?: string | null;
};

export type EngagementPatch = {
  delivered_at?: string;
  first_opened_at?: string;
  open_count?: number;
  first_clicked_at?: string;
  click_count?: number;
  last_event_at?: string;
};

export type EngagementUpdate = { id: string; patch: EngagementPatch };

const earlier = (a: string | null | undefined, b: string): string => (a && a < b ? a : b);
const later = (a: string | null | undefined, b: string): string => (a && a > b ? a : b);

/**
 * Fold a batch of events onto the sends they belong to, one update per send.
 *
 * Counts are incremented from what the row already holds, so a webhook
 * retry adds to the tally rather than resetting it — and first-open and
 * first-click only ever move earlier, never later, because the provider does
 * not promise events in order.
 *
 * Returns nothing for a send whose values would not change, so a repeated
 * delivery costs no write.
 */
export function foldEngagement(
  events: EngagementEvent[],
  rows: EngagementRow[]
): EngagementUpdate[] {
  const byMessageId = new Map(rows.map((r) => [r.provider_message_id, r]));
  const patches = new Map<string, EngagementPatch>();

  for (const e of events) {
    const row = byMessageId.get(e.messageId);
    if (!row) continue; // another tool's send

    const patch = patches.get(row.id) ?? {};

    if (e.kind === "delivered") {
      patch.delivered_at = earlier(patch.delivered_at ?? row.delivered_at, e.at);
    } else if (e.kind === "opened") {
      patch.first_opened_at = earlier(patch.first_opened_at ?? row.first_opened_at, e.at);
      patch.open_count = (patch.open_count ?? row.open_count ?? 0) + 1;
    } else {
      patch.first_clicked_at = earlier(patch.first_clicked_at ?? row.first_clicked_at, e.at);
      patch.click_count = (patch.click_count ?? row.click_count ?? 0) + 1;
    }

    patch.last_event_at = later(patch.last_event_at ?? row.last_event_at, e.at);
    patches.set(row.id, patch);
  }

  const updates: EngagementUpdate[] = [];
  for (const [id, patch] of patches) {
    const row = rows.find((r) => r.id === id)!;
    const changed =
      (patch.delivered_at !== undefined && patch.delivered_at !== row.delivered_at) ||
      (patch.first_opened_at !== undefined && patch.first_opened_at !== row.first_opened_at) ||
      (patch.open_count !== undefined && patch.open_count !== (row.open_count ?? 0)) ||
      (patch.first_clicked_at !== undefined && patch.first_clicked_at !== row.first_clicked_at) ||
      (patch.click_count !== undefined && patch.click_count !== (row.click_count ?? 0)) ||
      (patch.last_event_at !== undefined && patch.last_event_at !== row.last_event_at);
    if (changed) updates.push({ id, patch });
  }
  return updates;
}

export type EngagementState = {
  /** What to show on the timeline entry. */
  label: string;
  /** How much the label is worth. Drives the colour, and the caveat. */
  strength: "acted" | "weak" | "delivered" | "quiet" | "failed";
  /** The caveat, in plain English. Always shown — never buried in a tooltip. */
  detail: string;
};

const times = (n: number): string => (n === 1 ? "once" : n === 2 ? "twice" : `${n} times`);

/**
 * What we can honestly say about one send. The wording is deliberate:
 * nothing here claims a person read anything unless they clicked.
 */
export function describeEngagement(row: EngagementRow): EngagementState {
  if (row.status === "bounced" || row.status === "complained" || row.status === "failed") {
    return {
      label: row.status === "complained" ? "Reported as spam" : "Not delivered",
      strength: "failed",
      detail: "This never reached them. Anything waiting on a response from it is waiting on nothing.",
    };
  }

  // A reply outranks everything. It is the only signal that is a person by
  // definition, and it is the one the whole channel exists to produce.
  if (row.replied_at) {
    return {
      label: "They replied",
      strength: "acted",
      detail: "Their answer is on the timeline below.",
    };
  }

  const clicks = row.click_count ?? 0;
  const opens = row.open_count ?? 0;

  if (clicks > 0) {
    return {
      label: `Clicked a link${clicks > 1 ? ` (${times(clicks)})` : ""}`,
      strength: "acted",
      detail: "Someone followed a link in this email. That is the closest thing to proof a person engaged.",
    };
  }

  if (opens > 0) {
    return {
      label: `Opened ${times(opens)}`,
      strength: "weak",
      detail:
        "Treat this as a hint, not proof. Apple Mail and company security scanners fetch the tracking image without anyone reading the message.",
    };
  }

  if (row.delivered_at) {
    return {
      label: "Delivered",
      strength: "delivered",
      detail: "It reached their mail server. Whether anyone has looked at it, we can't say.",
    };
  }

  return {
    label: "Sent",
    strength: "quiet",
    detail: "Nothing back from the provider yet — no delivery confirmation, and no opens.",
  };
}
