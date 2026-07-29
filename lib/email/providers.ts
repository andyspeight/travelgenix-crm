/**
 * Email providers — purpose-routed dispatch.
 *
 * The Luna suite splits email by job, and so does the CRM:
 *
 *   OPERATIONAL (one-to-one replies, booking admin, journey drafts an agent
 *   dispatches) → SendGrid — the transactional provider.
 *
 *   MARKETING (campaigns, bulk outreach — when they graduate from mailto)
 *   → Brevo — where Luna Marketing already sends, keeping campaign
 *   reputation, unsubscribes and sender identities in one place.
 *
 * When only one provider is configured it carries both purposes rather than
 * refusing — a small agency with one key still gets real sending, and the
 * settings screen says exactly which mode the workspace is in. No keys at
 * all → emailConfigured() is false and every UI falls back to mailto.
 * Nothing breaks, nothing pretends to send.
 *
 * Server-only, plain REST (no SDKs to version-chase), same house rules as
 * the AI routes: keys from env, hard timeout, fails closed with a readable
 * error that never contains the key.
 *
 * Env:
 *   SENDGRID_API_KEY      — transactional sends
 *   BREVO_API_KEY         — marketing sends
 *   EMAIL_FROM            — verified sender address (both providers)
 *   EMAIL_FROM_NAME       — optional display name (default "Luna Work")
 *   EMAIL_FROM_MARKETING  — optional separate marketing sender address
 */

import type { SendPurpose } from "@/lib/email/policy";

const TIMEOUT_MS = 10_000;

export type EmailProvider = "sendgrid" | "brevo";

export type ProviderSendResult =
  | { ok: true; messageId: string; provider: EmailProvider }
  | { ok: false; error: string };

export function sendgridReady(): boolean {
  return Boolean(process.env.SENDGRID_API_KEY && process.env.EMAIL_FROM);
}
export function brevoReady(): boolean {
  return Boolean(process.env.BREVO_API_KEY && process.env.EMAIL_FROM);
}

/** Any provider available at all? Drives the UI's real-send vs mailto mode. */
export function emailConfigured(): boolean {
  return sendgridReady() || brevoReady();
}

/** Which provider a purpose would use right now (null = none → mailto). */
export function providerFor(purpose: SendPurpose): EmailProvider | null {
  if (purpose === "marketing") {
    if (brevoReady()) return "brevo";
    if (sendgridReady()) return "sendgrid";
  } else {
    if (sendgridReady()) return "sendgrid";
    if (brevoReady()) return "brevo";
  }
  return null;
}

type SendArgs = {
  purpose: SendPurpose;
  toEmail: string;
  toName?: string | null;
  subject: string;
  text: string;
};

function fromFor(purpose: SendPurpose): { email: string; name: string } {
  const address =
    purpose === "marketing"
      ? process.env.EMAIL_FROM_MARKETING || process.env.EMAIL_FROM!
      : process.env.EMAIL_FROM!;
  return { email: address, name: process.env.EMAIL_FROM_NAME || "Luna Work" };
}

export async function sendEmail(args: SendArgs): Promise<ProviderSendResult> {
  const provider = providerFor(args.purpose);
  if (!provider) return { ok: false, error: "Email sending is not configured." };
  return provider === "sendgrid" ? viaSendgrid(args) : viaBrevo(args);
}

// ─── SendGrid (transactional) ─────────────────────────────────────────────

async function viaSendgrid(args: SendArgs): Promise<ProviderSendResult> {
  const from = fromFor(args.purpose);
  try {
    const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        authorization: `Bearer ${process.env.SENDGRID_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        personalizations: [
          {
            to: [
              args.toName
                ? { email: args.toEmail, name: args.toName }
                : { email: args.toEmail },
            ],
          },
        ],
        from,
        subject: args.subject,
        content: [{ type: "text/plain", value: args.text }],
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });

    if (res.status === 202) {
      // SendGrid answers 202 with an empty body; the id lives in a header.
      return {
        ok: true,
        messageId: res.headers.get("x-message-id") ?? "",
        provider: "sendgrid",
      };
    }
    const detail = await res.text().catch(() => "");
    let message = `Provider error (${res.status})`;
    try {
      const parsed = JSON.parse(detail) as { errors?: { message?: string }[] };
      const first = parsed.errors?.[0]?.message;
      if (first) message = `Provider error: ${first}`;
    } catch {
      /* keep the status-only message */
    }
    return { ok: false, error: message };
  } catch (err) {
    return { ok: false, error: unreachableMessage(err) };
  }
}

// ─── Brevo (marketing) ────────────────────────────────────────────────────

async function viaBrevo(args: SendArgs): Promise<ProviderSendResult> {
  const from = fromFor(args.purpose);
  try {
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": process.env.BREVO_API_KEY!,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        sender: from,
        to: [
          args.toName
            ? { email: args.toEmail, name: args.toName }
            : { email: args.toEmail },
        ],
        subject: args.subject,
        textContent: args.text,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      let message = `Provider error (${res.status})`;
      try {
        const parsed = JSON.parse(detail) as { message?: string };
        if (parsed.message) message = `Provider error: ${parsed.message}`;
      } catch {
        /* keep the status-only message */
      }
      return { ok: false, error: message };
    }
    const data = (await res.json().catch(() => ({}))) as { messageId?: string };
    return { ok: true, messageId: data.messageId ?? "", provider: "brevo" };
  } catch (err) {
    return { ok: false, error: unreachableMessage(err) };
  }
}

function unreachableMessage(err: unknown): string {
  const timedOut = err instanceof Error && err.name === "TimeoutError";
  return timedOut
    ? "The email provider took too long to answer. The message was not sent — try again."
    : "Could not reach the email provider. The message was not sent.";
}
