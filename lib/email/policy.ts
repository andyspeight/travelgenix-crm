/**
 * Send policy — the one gate every outbound email passes through.
 *
 * Pure function, no I/O: the API route gathers the facts (address, consent
 * state, suppression), this decides. Keeping the decision in one tested
 * place means the inbox, enquiries, journeys and any future caller can never
 * disagree about who may be emailed — and every refusal carries a plain
 * English reason the agent sees, not a silent drop.
 *
 * The rules, in order:
 *   1. No address → no send.
 *   2. Suppressed address (hard bounce / spam complaint) → no send, for any
 *      purpose. A dead or hostile address is dead for service messages too.
 *   3. Marketing purpose needs a positive, current email consent grant —
 *      refused and never-recorded both block (PECR-safe by default).
 *      Operational sends (replies, booking admin) skip the consent gate;
 *      the law distinguishes the two, and so do we.
 */

export type SendPurpose = "operational" | "marketing";

export type SendFacts = {
  purpose: SendPurpose;
  toEmail: string | null;
  /**
   * Current email-channel consent for the recipient, where known.
   * "no_contact_record" = we're emailing an address with no contact row
   * (e.g. a brand-new enquiry) — fine operationally, blocked for marketing.
   */
  consent: "granted" | "refused" | "unknown" | "no_contact_record";
  suppressed: boolean;
  suppressionReason?: string | null;
};

export type SendDecision =
  | { allowed: true }
  | { allowed: false; reason: string };

const SUPPRESSION_TEXT: Record<string, string> = {
  bounce: "this address has hard-bounced before",
  complaint: "this address reported a previous email as spam",
  manual: "this address is on the do-not-send list",
};

export function decideSend(facts: SendFacts): SendDecision {
  if (!facts.toEmail || !facts.toEmail.includes("@")) {
    return { allowed: false, reason: "No valid email address on file." };
  }

  if (facts.suppressed) {
    const why =
      SUPPRESSION_TEXT[facts.suppressionReason ?? ""] ??
      "this address is suppressed";
    return {
      allowed: false,
      reason: `Not sent — ${why}. Confirm a working address with the customer first.`,
    };
  }

  if (facts.purpose === "marketing") {
    if (facts.consent === "refused") {
      return {
        allowed: false,
        reason: "Not sent — this contact has refused marketing email.",
      };
    }
    if (facts.consent !== "granted") {
      return {
        allowed: false,
        reason:
          "Not sent — no marketing email consent on record. Record their consent on the customer page first.",
      };
    }
  }

  return { allowed: true };
}
