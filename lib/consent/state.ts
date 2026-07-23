/**
 * Consent state — pure readers over the append-only consent ledger.
 *
 * The ledger (consents table) is rows of evidence; the CURRENT state of a
 * (contact, channel) pair is the latest row for it. These helpers reduce a
 * pile of ledger rows to that state, and answer the only question that
 * matters at send time: may we market to this person on this channel?
 *
 * The three states are deliberate:
 *   granted — a positive, evidenced opt-in
 *   refused — a positive, evidenced opt-out (never overridden by silence)
 *   unknown — no ledger entry. Unknown is NOT refusal, but unknown does not
 *             permit marketing either. PECR-safe by default.
 */

export const CONSENT_CHANNELS = [
  "email",
  "sms",
  "whatsapp",
  "phone",
  "post",
  "profiling",
] as const;

export type ConsentChannel = (typeof CONSENT_CHANNELS)[number];

export const CHANNEL_LABELS: Record<ConsentChannel, string> = {
  email: "Email",
  sms: "SMS",
  whatsapp: "WhatsApp",
  phone: "Phone",
  post: "Post",
  profiling: "Profiling",
};

/** The subset of a ledger row these helpers need. */
export type ConsentLedgerRow = {
  contact_id: string;
  channel: string;
  granted: boolean;
  occurred_at: string;
  source: string;
};

export type ChannelState = {
  state: "granted" | "refused" | "unknown";
  occurred_at: string | null;
  source: string | null;
};

export type ConsentState = Map<string, Map<ConsentChannel, ChannelState>>;

const UNKNOWN: ChannelState = { state: "unknown", occurred_at: null, source: null };

/**
 * Reduce ledger rows to current state per contact per channel: latest row
 * wins. Rows arrive in any order; ties on timestamp keep the later-seen row
 * (identical timestamps are vanishingly rare in an append-only ledger).
 */
export function currentConsent(rows: ConsentLedgerRow[]): ConsentState {
  const byContact: ConsentState = new Map();
  for (const row of rows) {
    if (!(CONSENT_CHANNELS as readonly string[]).includes(row.channel)) continue;
    const channel = row.channel as ConsentChannel;
    let channels = byContact.get(row.contact_id);
    if (!channels) {
      channels = new Map();
      byContact.set(row.contact_id, channels);
    }
    const existing = channels.get(channel);
    if (
      !existing ||
      existing.occurred_at == null ||
      row.occurred_at >= existing.occurred_at
    ) {
      channels.set(channel, {
        state: row.granted ? "granted" : "refused",
        occurred_at: row.occurred_at,
        source: row.source,
      });
    }
  }
  return byContact;
}

/** Current state for one contact + channel; unknown when nothing recorded. */
export function channelState(
  state: ConsentState,
  contactId: string,
  channel: ConsentChannel
): ChannelState {
  return state.get(contactId)?.get(channel) ?? UNKNOWN;
}

/**
 * The send-time gate: marketing on a channel needs a positive, current
 * grant. Refused and unknown both answer no.
 */
export function canMarket(
  state: ConsentState,
  contactId: string,
  channel: ConsentChannel
): boolean {
  return channelState(state, contactId, channel).state === "granted";
}
