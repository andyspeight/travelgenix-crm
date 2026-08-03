/**
 * /api/team/invitations — invite a teammate, list invites, revoke one.
 *
 * An invitation records a decision ("Priya joins as an admin") and, when a
 * mail provider is configured, emails her a sign-in link. It does NOT grant
 * access — Control does — so this route never touches sign-in. It writes a
 * row, optionally sends a link, and says plainly which of those happened.
 *
 * Only an owner or admin may invite or revoke. Every query is agency-scoped;
 * the email is lower-cased so one person is one row.
 */

import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { apiAgencyId, getSession } from "@/lib/auth/session";
import { validateInvite, alreadyMember, roleLabel } from "@/lib/team/invite";
import { resolveSender } from "@/lib/email/sender";
import { sendEmail, emailConfigured } from "@/lib/email/providers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Owner and admin may manage the team; a member may not. */
async function canManageTeam(): Promise<{ ok: boolean; email: string | null }> {
  const session = await getSession();
  if (!session) return { ok: false, email: null };
  const ok = session.role === "owner" || session.role === "admin";
  return { ok, email: session.control?.email ?? null };
}

/** The app's own origin, for the sign-in link in the email. */
function appOrigin(): string {
  const h = headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  return host ? `${proto}://${host}` : "https://crm.travelify.io";
}

export async function GET() {
  const agencyId = await apiAgencyId();
  if (!agencyId) return NextResponse.json({ ok: false, error: "No access to this workspace." }, { status: 403 });

  const supabase = createClient();
  const { data, error } = await supabase
    .from("agency_invitations")
    .select("id, email, role, status, invited_by_email, invited_at")
    .eq("agency_id", agencyId)
    .order("invited_at", { ascending: false });

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, invitations: data ?? [] });
}

export async function POST(request: Request) {
  const agencyId = await apiAgencyId();
  if (!agencyId) return NextResponse.json({ ok: false, error: "No access to this workspace." }, { status: 403 });

  const { ok: allowed } = await canManageTeam();
  if (!allowed) {
    return NextResponse.json(
      { ok: false, error: "Only an owner or admin can invite teammates." },
      { status: 403 }
    );
  }
  const { email: inviterEmail } = await canManageTeam();

  let parsed: { email?: unknown; role?: unknown };
  try {
    parsed = (await request.json()) as { email?: unknown; role?: unknown };
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const invite = validateInvite({ email: parsed.email, role: parsed.role });
  if (!invite.ok) return NextResponse.json({ ok: false, error: invite.error }, { status: 400 });

  const supabase = createClient();

  // Already on the team? Then there is nothing to invite — say so rather than
  // record a pending invite for someone who is already here.
  const { data: members } = await supabase
    .from("users")
    .select("email")
    .eq("agency_id", agencyId);
  const memberEmails = ((members ?? []) as { email: string }[]).map((m) => m.email);
  if (alreadyMember(invite.email, memberEmails)) {
    return NextResponse.json(
      { ok: false, error: "That person is already on the team." },
      { status: 409 }
    );
  }

  // One row per (agency, email): re-inviting a revoked address flips it back
  // to pending rather than stacking duplicates.
  const { data: row, error } = await supabase
    .from("agency_invitations")
    .upsert(
      {
        agency_id: agencyId,
        email: invite.email,
        role: invite.role,
        status: "pending",
        invited_by_email: inviterEmail,
        invited_at: new Date().toISOString(),
        revoked_at: null,
      },
      { onConflict: "agency_id,email" }
    )
    .select("id, email, role, status, invited_by_email, invited_at")
    .maybeSingle();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  // Best-effort sign-in link. The invite is recorded either way; whether the
  // email went is reported honestly rather than assumed.
  let emailed = false;
  if (emailConfigured()) {
    emailed = await sendInvite(invite.email, invite.role, inviterEmail, agencyId, supabase);
  }

  return NextResponse.json({ ok: true, invitation: row, emailed, emailConfigured: emailConfigured() });
}

export async function DELETE(request: Request) {
  const agencyId = await apiAgencyId();
  if (!agencyId) return NextResponse.json({ ok: false, error: "No access to this workspace." }, { status: 403 });

  const { ok: allowed } = await canManageTeam();
  if (!allowed) {
    return NextResponse.json(
      { ok: false, error: "Only an owner or admin can revoke an invite." },
      { status: 403 }
    );
  }

  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false, error: "Which invite?" }, { status: 400 });

  const supabase = createClient();
  const { error } = await supabase
    .from("agency_invitations")
    .update({ status: "revoked", revoked_at: new Date().toISOString() })
    .eq("agency_id", agencyId)
    .eq("id", id);

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

/** Send the sign-in link. Returns whether it actually went. */
async function sendInvite(
  toEmail: string,
  role: string,
  inviterEmail: string | null,
  agencyId: string,
  supabase: ReturnType<typeof createClient>
): Promise<boolean> {
  const { data: agencyRow } = await supabase
    .from("agencies")
    .select("name, email_from_address, email_from_name, email_reply_to, email_sender_verified")
    .eq("id", agencyId)
    .maybeSingle();

  const agencyName = (agencyRow?.name as string | undefined) ?? "your travel workspace";
  const sender = resolveSender(
    {
      name: agencyName,
      emailFromAddress: (agencyRow?.email_from_address as string | null) ?? null,
      emailFromName: (agencyRow?.email_from_name as string | null) ?? null,
      emailReplyTo: (agencyRow?.email_reply_to as string | null) ?? null,
      emailSenderVerified: Boolean(agencyRow?.email_sender_verified),
    },
    { address: process.env.EMAIL_FROM!, name: process.env.EMAIL_FROM_NAME || "Luna Work" }
  );

  const link = appOrigin();
  const who = inviterEmail ? `${inviterEmail} has` : "You've been";
  const text = [
    `${who} invited you to ${agencyName} on Luna Work, as ${roleLabel(role).toLowerCase()}.`,
    "",
    `Sign in here: ${link}`,
    "",
    "You'll sign in with your Luna account. If you don't have one yet, you'll be guided through it.",
  ].join("\n");

  const result = await sendEmail({
    purpose: "operational",
    toEmail,
    subject: `You're invited to ${agencyName} on Luna Work`,
    text,
    sender,
  });
  return result.ok;
}
