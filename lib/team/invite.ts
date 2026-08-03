/**
 * Team invitations — the pure core.
 *
 * An invitation is a decision, not a grant: "this person should have access to
 * this workspace, as this role". Control is what actually lets them in. So the
 * job here is small and honest — decide whether an email and role are a valid
 * invite, and work out how a given invite should read next to the people who
 * are already on the team.
 *
 * No I/O, no DOM: the API supplies the agency and the current members, this
 * only validates and labels.
 */

/** The roles an agency can hand out. Mirrors Control's ControlRole. */
export const INVITE_ROLES = ["member", "admin", "owner"] as const;
export type InviteRole = (typeof INVITE_ROLES)[number];

/** The roles a person can be INVITED as. Owner is the account holder, not an
 *  invite — you don't invite someone to own the workspace from this screen. */
export const INVITABLE_ROLES: InviteRole[] = ["member", "admin"];

export type InviteInput = { email?: unknown; role?: unknown };

export type InviteResult =
  | { ok: true; email: string; role: InviteRole }
  | { ok: false; error: string };

// Deliberately simple: one @, a dot in the domain, no spaces. The real test of
// an address is whether the sign-in link arrives, not a clever regex.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normaliseEmail(raw: unknown): string {
  return typeof raw === "string" ? raw.trim().toLowerCase() : "";
}

export function roleLabel(role: string): string {
  if (role === "owner") return "Owner";
  if (role === "admin") return "Admin";
  return "Member";
}

/**
 * Validate an invite. An unknown or missing role falls to "member" — the least
 * access — because the safe default when it's unclear is the smaller grant, not
 * the larger one. Owner cannot be handed out here.
 */
export function validateInvite(input: InviteInput): InviteResult {
  const email = normaliseEmail(input.email);
  if (!email) return { ok: false, error: "Enter an email address to invite." };
  if (!EMAIL_RE.test(email)) return { ok: false, error: "That doesn't look like an email address." };

  const raw = typeof input.role === "string" ? input.role : "member";
  const role: InviteRole = raw === "admin" ? "admin" : "member";
  return { ok: true, email, role };
}

/** Is this address already a member of the team (so an invite is redundant)? */
export function alreadyMember(email: string, memberEmails: string[]): boolean {
  const target = normaliseEmail(email);
  return memberEmails.some((m) => normaliseEmail(m) === target);
}

export type InviteRow = { email: string; role: string; status: string };

/**
 * How an invite should read in the list, given who is already on the team:
 *   - "joined"  the invited address now matches a real member
 *   - "invited" recorded and awaiting their first sign-in
 *   - "revoked" pulled; kept for the record but shown greyed / filtered out
 */
export function inviteStatus(
  invite: InviteRow,
  memberEmails: string[]
): "joined" | "invited" | "revoked" {
  if (invite.status === "revoked") return "revoked";
  if (alreadyMember(invite.email, memberEmails)) return "joined";
  return "invited";
}
