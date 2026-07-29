/**
 * Provider webhook events — normalising and sorting a shared firehose.
 *
 * The SendGrid account is shared across the whole Travelgenix estate, so this
 * endpoint receives delivery events for EVERY tool that sends: Luna
 * Marketing, the widget suite, quote PDFs, booking mail, and the CRM. Most of
 * what arrives is not ours.
 *
 * That is fine, and it must stay cheap. The rule is simple and conservative:
 * an event is ours only if its provider message id matches a send WE
 * recorded. Everything else is acknowledged and dropped without a write.
 *
 * We deliberately do NOT suppress an address just because it bounced from
 * another tool, even though the address is probably dead. We would have no
 * way to know which agency it belonged to, and suppressing on an ambiguous
 * signal would silently stop one agency's mail because of another product's
 * bounce. Wrong-and-quiet is the worst failure mode here.
 *
 * Pure functions, no I/O, so the sorting logic is testable without a
 * database or a provider.
 */

/** Provider event names → our suppression reason. Anything else is ignored. */
export const SUPPRESS: Record<string, "bounce" | "complaint"> = {
  // Brevo
  hard_bounce: "bounce",
  blocked: "bounce",
  invalid_email: "bounce",
  spam: "complaint",
  complaint: "complaint",
  // SendGrid
  bounce: "bounce",
  dropped: "bounce",
  spamreport: "complaint",
};

export type RawEvent = {
  event?: unknown;
  email?: unknown;
  reason?: unknown;
  ["message-id"]?: unknown; // Brevo
  sg_message_id?: unknown; // SendGrid (id + routing suffix after a dot)
};

export type NormalEvent = {
  event: string;
  email: string;
  messageId: string | null;
  detail: string | null;
  reason: "bounce" | "complaint";
};

/** How many events we will consider from one delivery. */
export const MAX_EVENTS = 500;

/**
 * Turn whatever the provider posted into our shape, keeping only the events
 * that would suppress an address. Brevo posts a single object; SendGrid posts
 * an array — both are accepted.
 */
export function normaliseEvents(payload: unknown): NormalEvent[] {
  const list = Array.isArray(payload) ? payload : [payload];
  const out: NormalEvent[] = [];

  for (const item of list.slice(0, MAX_EVENTS)) {
    const raw = (item ?? {}) as RawEvent;
    const event = typeof raw.event === "string" ? raw.event : "";
    const reason = SUPPRESS[event];
    if (!reason) continue; // delivered / opened / deferred / soft bounce

    const email = typeof raw.email === "string" ? raw.email.trim().toLowerCase() : "";
    if (!email) continue;

    const sgId = typeof raw.sg_message_id === "string" ? raw.sg_message_id : null;
    const brevoId = typeof raw["message-id"] === "string" ? raw["message-id"] : null;

    out.push({
      event,
      email,
      // SendGrid appends a routing suffix after the first dot; we stored the
      // bare X-Message-Id header at send time, so strip back to it.
      messageId: sgId ? sgId.split(".")[0] : brevoId,
      detail: typeof raw.reason === "string" ? raw.reason.slice(0, 300) : null,
      reason,
    });
  }
  return out;
}

/** The message ids worth looking up — deduped, and never a null. */
export function messageIdsToCheck(events: NormalEvent[]): string[] {
  return Array.from(
    new Set(events.map((e) => e.messageId).filter((id): id is string => Boolean(id)))
  );
}

export type OwnedSend = {
  id: string;
  agency_id: string;
  household_id: string | null;
  provider_message_id: string;
};

/**
 * Keep only the events that belong to sends we made, pairing each with its
 * send. One lookup upstream, no per-event query, so a firehose of other
 * tools' events costs a single round trip and no writes.
 */
export function ourEvents(
  events: NormalEvent[],
  sends: OwnedSend[]
): { event: NormalEvent; send: OwnedSend }[] {
  const byMessageId = new Map(sends.map((s) => [s.provider_message_id, s]));
  const paired: { event: NormalEvent; send: OwnedSend }[] = [];
  for (const event of events) {
    if (!event.messageId) continue;
    const send = byMessageId.get(event.messageId);
    if (send) paired.push({ event, send });
  }
  return paired;
}
