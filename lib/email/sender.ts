/**
 * Who the email comes FROM.
 *
 * The customer is the agency's customer, not ours. A traveller booking with
 * Sunshine Holidays must see mail from Sunshine Holidays — a platform-wide
 * "from" address would be wrong on every send.
 *
 * The constraint is deliverability, not preference. A receiving mail server
 * decides whether to trust a From address by checking SPF/DKIM against the
 * sending domain. We can only put an agency's own domain in From once that
 * domain is authenticated with the provider; before that it reads as
 * spoofing and lands in spam, which is worse than not sending at all.
 *
 * So there are two honest states, and this function picks between them:
 *
 *   VERIFIED — the agency's domain is authenticated. From is genuinely
 *   theirs. Nothing of ours appears.
 *
 *   NOT YET — From is the platform's authenticated address but carries the
 *   AGENCY'S NAME, and Reply-To is the agency's own address so replies go
 *   straight to them. The traveller sees the agency's name in their inbox and
 *   replies reach the agency; only the underlying address is ours, which is
 *   the standard arrangement for sending on someone's behalf.
 *
 * Either way the display name is never blank and never ours.
 */

export type AgencySender = {
  /** The agency's display name — the fallback for what recipients see. */
  name: string;
  emailFromAddress: string | null;
  emailFromName: string | null;
  emailReplyTo: string | null;
  emailSenderVerified: boolean;
};

export type PlatformSender = {
  address: string;
  name: string;
};

export type ResolvedSender = {
  fromEmail: string;
  fromName: string;
  replyTo: string | null;
  /** True when From is the agency's own authenticated domain. */
  ownDomain: boolean;
};

const clean = (v: string | null | undefined): string | null => {
  const t = (v ?? "").trim();
  return t.length > 0 ? t : null;
};

export function resolveSender(
  agency: AgencySender,
  platform: PlatformSender
): ResolvedSender {
  const own = clean(agency.emailFromAddress);
  // What recipients see: the agency's chosen name, else the agency's name.
  // Never the platform's — that would misrepresent who is writing.
  const fromName = clean(agency.emailFromName) ?? clean(agency.name) ?? platform.name;

  if (agency.emailSenderVerified && own) {
    return {
      fromEmail: own,
      fromName,
      // Only worth setting when replies should go somewhere else.
      replyTo: clean(agency.emailReplyTo),
      ownDomain: true,
    };
  }

  // Not verified: send from the platform's authenticated address, but make
  // sure a reply reaches the agency rather than us.
  return {
    fromEmail: platform.address,
    fromName,
    replyTo: clean(agency.emailReplyTo) ?? own,
    ownDomain: false,
  };
}
