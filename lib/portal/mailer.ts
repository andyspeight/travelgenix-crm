/**
 * Sending the login link.
 *
 * A magic-link email is transactional (an "operational" send, in the policy
 * lib's terms), so it skips the marketing-consent gate — a person asking to
 * sign in has, by definition, asked us to email them. It still goes out as the
 * AGENCY, never the platform (resolveSender), because the traveller is the
 * agency's customer. We do NOT record it on the CRM timeline: an auth link is
 * plumbing, not correspondence an agent needs to see.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { sendEmail } from "@/lib/email/providers";
import { resolveSender } from "@/lib/email/sender";

export async function sendLoginLink(
  supabase: SupabaseClient,
  args: { agencyId: string; toEmail: string; toName: string | null; link: string }
): Promise<{ ok: boolean; error?: string }> {
  const { data: agency } = await supabase
    .from("agencies")
    .select("name, email_from_address, email_from_name, email_reply_to, email_sender_verified")
    .eq("id", args.agencyId)
    .maybeSingle();

  const agencyName = (agency?.name as string | undefined) || "your travel agent";
  const sender = resolveSender(
    {
      name: agencyName,
      emailFromAddress: (agency?.email_from_address as string | null) ?? null,
      emailFromName: (agency?.email_from_name as string | null) ?? null,
      emailReplyTo: (agency?.email_reply_to as string | null) ?? null,
      emailSenderVerified: Boolean(agency?.email_sender_verified),
    },
    { address: process.env.EMAIL_FROM!, name: process.env.EMAIL_FROM_NAME || "Luna Work" }
  );

  const greeting = args.toName ? `Hi ${args.toName},` : "Hi,";
  const text = `${greeting}

Here is your secure link to view your trips with ${agencyName}:

${args.link}

The link works once and expires in 30 minutes. If you didn't ask to sign in, you can ignore this email.

${agencyName}`;

  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#141b2c">
<p>${greeting}</p>
<p>Here is your secure link to view your trips with <strong>${escapeHtml(agencyName)}</strong>:</p>
<p><a href="${escapeAttr(args.link)}" style="display:inline-block;padding:12px 22px;background:#0c6e82;color:#fff;border-radius:8px;text-decoration:none;font-weight:600">View my trips</a></p>
<p style="color:#4c5a70;font-size:13px">The link works once and expires in 30 minutes. If you didn't ask to sign in, you can safely ignore this email.</p>
<p style="color:#4c5a70">${escapeHtml(agencyName)}</p>
</div>`;

  const result = await sendEmail({
    purpose: "operational",
    toEmail: args.toEmail,
    toName: args.toName,
    subject: `Your link to view your trips with ${agencyName}`,
    text,
    html,
    sender,
  });
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/"/g, "&quot;");
}
