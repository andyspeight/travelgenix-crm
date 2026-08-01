/**
 * Inbound email — the half of the conversation the CRM has never seen.
 *
 * Until now the timeline knew what we SENT. A customer answering that email
 * was invisible: the enquiry still read "waiting", the chase carried on, and
 * the only thing that stopped it was an agent noticing in their own inbox and
 * marking it by hand. This closes the loop.
 *
 * HOW A REPLY IS TIED BACK TO A SEND, strongest first:
 *
 *   1. THE REPLY ADDRESS. When an inbound domain is configured we send with
 *      Reply-To: reply+<sendId>@<domain>. The reply comes back carrying the
 *      exact id of the message it answers. No guessing, no header archaeology.
 *
 *   2. THE THREAD HEADERS. In-Reply-To / References, matched against the
 *      provider message id we recorded. Providers vary in what they put in
 *      Message-ID, so this is a bonus when it works, never the foundation.
 *
 *   3. THE SENDER'S ADDRESS. If we hold exactly one contact with that email,
 *      it is almost certainly them. Weaker: shared family addresses exist,
 *      and the same address can appear in two agencies.
 *
 *   4. Nothing. Then we say so and park it, because a customer's reply
 *      disappearing quietly is far worse than one filed as "needs a human".
 *
 * AN OUT-OF-OFFICE IS NOT A REPLY. It is a machine saying nobody is reading.
 * Treating it as an answer would stop a chase on the strength of an absence —
 * the exact opposite of the truth. Auto-replies are recorded on the timeline,
 * flagged, and excluded from the "they replied" signal.
 *
 * Pure functions, no I/O.
 */

export type InboundMessage = {
  fromEmail: string;
  fromName: string | null;
  toEmail: string | null;
  subject: string | null;
  /** The new words only — the quoted original stripped off. */
  body: string;
  /** Everything they sent, kept whole. */
  rawBody: string;
  messageId: string | null;
  inReplyTo: string | null;
  references: string[];
  isAutoReply: boolean;
};

/** "Rachel Whitfield" <rachel@x.com> → both halves. */
export function parseAddress(value: string | null | undefined): {
  email: string;
  name: string | null;
} {
  const raw = (value ?? "").trim();
  const angled = raw.match(/<([^>]+)>/);
  const email = (angled ? angled[1] : raw).trim().toLowerCase();
  let name: string | null = null;
  if (angled) {
    name = raw.slice(0, raw.indexOf("<")).trim().replace(/^["']|["']$/g, "") || null;
  }
  return { email, name };
}

/** Raw RFC822 headers → a lowercased map, continuation lines unfolded. */
export function parseHeaders(raw: string | null | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw) return out;
  let key: string | null = null;
  for (const line of raw.split(/\r?\n/)) {
    if (/^\s/.test(line) && key) {
      out[key] = `${out[key]} ${line.trim()}`;
      continue;
    }
    const at = line.indexOf(":");
    if (at <= 0) continue;
    key = line.slice(0, at).trim().toLowerCase();
    out[key] = line.slice(at + 1).trim();
  }
  return out;
}

/** <abc@mail> → abc@mail. Angle brackets are noise everywhere we compare. */
const bare = (id: string): string => id.replace(/[<>]/g, "").trim();

/** All the message ids in a header value, in order. */
export function messageIds(value: string | null | undefined): string[] {
  if (!value) return [];
  const found = value.match(/<[^>]+>/g);
  if (found) return found.map(bare).filter(Boolean);
  const single = bare(value);
  return single ? [single] : [];
}

/**
 * Where the quoted original starts. Everything from here down is the email
 * we already have on the timeline, and repeating it makes the record
 * unreadable.
 */
const QUOTE_BOUNDARY = [
  /^\s*-{2,}\s*Original Message\s*-{2,}/i,
  /^\s*_{5,}\s*$/,
  /^\s*-{5,}\s*$/,
  /^\s*From:\s.*@/i,
  /^\s*Sent from my /i,
  /wrote:\s*$/,
  /^\s*On .+ (?:at .+ )?wrote:/i,
];

export function stripQuoted(text: string): string {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const kept: string[] = [];

  for (const line of lines) {
    if (QUOTE_BOUNDARY.some((re) => re.test(line))) break;
    if (/^\s*>/.test(line)) continue; // an inline quote
    kept.push(line);
  }

  const trimmed = kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  // If stripping ate everything — an unusual client, a top-post we
  // misread — keep what they actually sent. A noisy timeline beats a blank
  // one that looks like they said nothing.
  return trimmed.length > 0 ? trimmed : text.trim();
}

/**
 * A machine, not a person. Checked on headers first because clients lie in
 * subject lines but rarely forge Auto-Submitted.
 */
export function isAutoReply(headers: Record<string, string>, subject: string | null): boolean {
  const auto = headers["auto-submitted"];
  if (auto && auto.toLowerCase() !== "no") return true;
  if (headers["x-autoreply"] || headers["x-autorespond"] || headers["x-auto-response-suppress"]) {
    return true;
  }
  const precedence = (headers["precedence"] ?? "").toLowerCase();
  if (precedence === "auto_reply" || precedence === "bulk" || precedence === "junk") return true;

  return /^\s*(out of office|automatic reply|auto ?reply|autoreply|away from|automatische)/i.test(
    subject ?? ""
  );
}

/** What SendGrid's Inbound Parse posts, as far as we care about it. */
export type InboundFields = {
  from?: string;
  to?: string;
  subject?: string;
  text?: string;
  html?: string;
  headers?: string;
  envelope?: string;
};

export function parseInbound(fields: InboundFields): InboundMessage {
  const headers = parseHeaders(fields.headers);
  const from = parseAddress(fields.from ?? headers["from"]);

  // The envelope recipient is what the mail server was actually handed, which
  // is what carries our reply tag. The To: header can be a display alias.
  let toEmail: string | null = null;
  if (fields.envelope) {
    try {
      const env = JSON.parse(fields.envelope) as { to?: unknown };
      const first = Array.isArray(env.to) ? env.to[0] : env.to;
      if (typeof first === "string") toEmail = parseAddress(first).email;
    } catch {
      // Malformed envelope — fall through to the header.
    }
  }
  if (!toEmail) toEmail = parseAddress(fields.to ?? headers["to"]).email || null;

  const subject = (fields.subject ?? headers["subject"] ?? "").trim() || null;
  const rawBody = (fields.text ?? "").trim();

  return {
    fromEmail: from.email,
    fromName: from.name,
    toEmail,
    subject,
    body: stripQuoted(rawBody),
    rawBody,
    messageId: messageIds(headers["message-id"])[0] ?? null,
    inReplyTo: messageIds(headers["in-reply-to"])[0] ?? null,
    references: messageIds(headers["references"]),
    isAutoReply: isAutoReply(headers, subject),
  };
}

/** An out-of-office is not an answer. Everything else from a person is. */
export const countsAsReply = (msg: InboundMessage): boolean => !msg.isAutoReply;

/** The tag in reply+<tag>@domain, or null. */
export function plusTag(email: string | null): string | null {
  if (!email) return null;
  const local = email.split("@")[0] ?? "";
  const plus = local.indexOf("+");
  if (plus === -1) return null;
  return local.slice(plus + 1).trim() || null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * What to look up before matching. Kept separate from the match itself so the
 * route can do one batched query rather than a query per candidate.
 */
export function threadKeys(msg: InboundMessage): { sendId: string | null; tokens: string[] } {
  const tag = plusTag(msg.toEmail);
  const tokens = new Set<string>();

  for (const id of [msg.inReplyTo, ...msg.references].filter(Boolean) as string[]) {
    tokens.add(id);
    const local = id.split("@")[0];
    if (local) {
      tokens.add(local);
      // SendGrid-style ids get dotted routing suffixes appended.
      for (const part of local.split(".")) if (part.length >= 8) tokens.add(part);
    }
  }

  return {
    sendId: tag && UUID.test(tag) ? tag.toLowerCase() : null,
    tokens: Array.from(tokens).slice(0, 20),
  };
}

export type MatchableSend = {
  id: string;
  agency_id: string;
  household_id: string | null;
  contact_id: string | null;
  enquiry_id: string | null;
  provider_message_id: string | null;
};

export type MatchableContact = {
  id: string;
  agency_id: string;
  household_id: string;
  email: string | null;
};

export type InboundMatch = {
  matchedBy: "thread" | "address" | "none";
  agencyId: string | null;
  householdId: string | null;
  contactId: string | null;
  enquiryId: string | null;
  sendId: string | null;
  /** Plain English, shown to whoever has to deal with an unmatched reply. */
  reason: string;
};

const NO_MATCH = (reason: string): InboundMatch => ({
  matchedBy: "none",
  agencyId: null,
  householdId: null,
  contactId: null,
  enquiryId: null,
  sendId: null,
  reason,
});

/**
 * Tie an inbound message to the send it answers, or to the person who sent
 * it, or to nothing — and say which, so the confidence is visible rather
 * than implied.
 */
export function matchInbound(
  msg: InboundMessage,
  keys: { sendId: string | null; tokens: string[] },
  ctx: { sends: MatchableSend[]; contacts: MatchableContact[] }
): InboundMatch {
  const fromSend = (send: MatchableSend, reason: string): InboundMatch => ({
    matchedBy: "thread",
    agencyId: send.agency_id,
    householdId: send.household_id,
    contactId: send.contact_id,
    enquiryId: send.enquiry_id,
    sendId: send.id,
    reason,
  });

  // 1. The reply address carried the send id.
  if (keys.sendId) {
    const exact = ctx.sends.find((s) => s.id === keys.sendId);
    if (exact) return fromSend(exact, "Replied to the exact message we sent — matched on the reply address.");
  }

  // 2. Thread headers against the provider's message id.
  for (const token of keys.tokens) {
    const hit = ctx.sends.find(
      (s) =>
        s.provider_message_id &&
        (s.provider_message_id === token || token.includes(s.provider_message_id))
    );
    if (hit) return fromSend(hit, "Threaded onto a message we sent — matched on the email headers.");
  }

  // 3. The sender's address.
  const byEmail = ctx.contacts.filter(
    (c) => (c.email ?? "").toLowerCase() === msg.fromEmail && msg.fromEmail.length > 0
  );

  if (byEmail.length === 1) {
    const c = byEmail[0];
    return {
      matchedBy: "address",
      agencyId: c.agency_id,
      householdId: c.household_id,
      contactId: c.id,
      enquiryId: null,
      sendId: null,
      reason: `Matched on the sender's address (${msg.fromEmail}) — not to a specific message.`,
    };
  }

  if (byEmail.length > 1) {
    const agencies = new Set(byEmail.map((c) => c.agency_id));
    if (agencies.size > 1) {
      return NO_MATCH(
        `${msg.fromEmail} exists in more than one agency, so we can't tell whose customer this is. Needs filing by hand.`
      );
    }
    const households = new Set(byEmail.map((c) => c.household_id));
    const agencyId = byEmail[0].agency_id;
    if (households.size === 1) {
      return {
        matchedBy: "address",
        agencyId,
        householdId: byEmail[0].household_id,
        contactId: byEmail[0].id,
        enquiryId: null,
        sendId: null,
        reason: `Matched on a shared address (${msg.fromEmail}) used by more than one person in this household.`,
      };
    }
    return {
      matchedBy: "address",
      agencyId,
      householdId: null,
      contactId: null,
      enquiryId: null,
      sendId: null,
      reason: `${msg.fromEmail} is on ${households.size} different customer records, so this isn't filed against one of them yet.`,
    };
  }

  return NO_MATCH(
    `Nothing links ${msg.fromEmail || "this message"} to a customer — no reply tag, no matching thread, and no contact with that address.`
  );
}
