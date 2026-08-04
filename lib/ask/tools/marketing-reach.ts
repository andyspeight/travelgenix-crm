/**
 * Query tool: marketing_reach
 *
 * Answers "who can we email?", "who's opted out of SMS?", "what's the marketing
 * consent status for the Davies?". Reads the consent ledger and reduces it with
 * the SAME state machine the send gate uses (lib/consent/state.ts) — a contact
 * is reachable on a channel only with a current, positive grant AND an address
 * on file for that channel. So Luna's "who can we email" never disagrees with
 * what the bulk-email flow will actually let through.
 */

import {
  type QueryTool,
  type QueryResult,
  type ResultRow,
  type Signal,
  listResult,
  emptyResult,
} from "../contract";
import {
  currentConsent,
  channelState,
  CHANNEL_LABELS,
  type ConsentChannel,
  type ConsentLedgerRow,
} from "@/lib/consent/state";

type ContactLite = {
  id: string;
  household_id: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
};

const CHANNEL_ADDRESS: Record<string, (c: ContactLite) => string | null> = {
  email: (c) => c.email,
  sms: (c) => c.phone,
  whatsapp: (c) => c.phone,
  phone: (c) => c.phone,
};

export const marketingReach: QueryTool = {
  name: "marketing_reach",
  description:
    "Who can we contact for marketing on a channel (email by default), based on recorded consent, and who has opted out. Use for 'who can we email', 'who's opted in', 'who opted out of SMS', 'marketing consent status', 'how many can we email', or a named customer's consent status.",
  examples: [
    "Who can we email?",
    "How many customers can we email?",
    "Who's opted out of SMS?",
    "What's the marketing consent status for the Davies?",
    "Who can we contact by WhatsApp?",
  ],
  params: [
    {
      name: "channel",
      type: "enum",
      required: false,
      description: "Marketing channel (default email).",
      options: ["email", "sms", "whatsapp", "phone"],
    },
    {
      name: "customer",
      type: "string",
      required: false,
      description: "Optional customer/household or traveller name to check just them.",
    },
  ],
  run: async (args, ctx): Promise<QueryResult> => {
    const channel = (typeof args.channel === "string" && CHANNEL_ADDRESS[args.channel] ? args.channel : "email") as ConsentChannel;
    const nameQuery = typeof args.customer === "string" ? args.customer.trim().toLowerCase() : "";
    const addressOf = CHANNEL_ADDRESS[channel];
    const channelLabel = CHANNEL_LABELS[channel] ?? channel;

    const [{ data: contactRows }, { data: consentRows }, { data: households }] = await Promise.all([
      ctx.db
        .from("contacts")
        .select("id, household_id, first_name, last_name, email, phone")
        .eq("agency_id", ctx.agencyId),
      ctx.db
        .from("consents")
        .select("contact_id, channel, granted, occurred_at, source")
        .eq("agency_id", ctx.agencyId),
      ctx.db.from("households").select("id, display_name").eq("agency_id", ctx.agencyId),
    ]);

    const nameById = new Map<string, string>(
      ((households ?? []) as { id: string; display_name: string }[]).map((h) => [h.id, h.display_name])
    );
    let contacts = (contactRows ?? []) as ContactLite[];
    if (nameQuery) {
      contacts = contacts.filter((c) => {
        const hh = (c.household_id ? nameById.get(c.household_id) : "")?.toLowerCase() ?? "";
        const person = [c.first_name, c.last_name].filter(Boolean).join(" ").toLowerCase();
        return hh.includes(nameQuery) || person.includes(nameQuery);
      });
    }

    const state = currentConsent((consentRows ?? []) as ConsentLedgerRow[]);

    let reachable = 0;
    let optedOut = 0;
    let noConsent = 0;
    let noAddress = 0;
    const rows: ResultRow[] = [];

    for (const c of contacts) {
      const cs = channelState(state, c.id, channel).state;
      const addr = addressOf(c);
      if (cs === "refused") {
        optedOut++;
        continue;
      }
      if (cs !== "granted") {
        noConsent++;
        continue;
      }
      // Granted — but only truly reachable with an address on file.
      if (!addr) {
        noAddress++;
        continue;
      }
      reachable++;
      rows.push({
        id: c.id,
        href: c.household_id ? `/customers/${c.household_id}` : "/customers",
        title: [c.first_name, c.last_name].filter(Boolean).join(" ") || "Contact",
        subtitle: [addr, c.household_id ? nameById.get(c.household_id) : null].filter(Boolean).join(" · "),
      });
    }

    if (rows.length === 0) {
      const who = nameQuery ? `“${(args.customer as string).trim()}”` : "your contacts";
      const reason = optedOut > 0 && reachable === 0 && noConsent === 0 ? "opted out" : "no marketing consent on file";
      return emptyResult(`No one reachable by ${channelLabel.toLowerCase()} for ${who} — ${reason}.`);
    }

    const signals: Signal[] = [
      {
        kind: "marketing_reach",
        detail:
          `${reachable} reachable by ${channelLabel.toLowerCase()}, ${optedOut} opted out, ${noConsent} with no consent recorded` +
          (noAddress ? `, ${noAddress} granted but no ${channelLabel.toLowerCase()} on file` : ""),
        severity: "info",
      },
    ];

    const rowsShown = rows.slice(0, 50);
    const summary =
      `${reachable} contact${reachable === 1 ? "" : "s"} can be reached by ${channelLabel.toLowerCase()}` +
      (rows.length > rowsShown.length ? ` (showing ${rowsShown.length}).` : ".");
    return listResult(rowsShown, summary, signals, true);
  },
};
