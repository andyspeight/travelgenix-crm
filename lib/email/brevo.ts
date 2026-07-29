/**
 * Brevo transactional email — the thin provider client.
 *
 * Server-only, plain REST (no SDK to version-chase), same house rules as the
 * AI routes: keys from env, hard timeout, fails closed with a readable error.
 * Brevo is the Luna suite's email provider (Luna Marketing already sends
 * through it), so the CRM joining it keeps deliverability reputation and
 * sender identities in one place.
 *
 * Configuration is exactly two env vars:
 *   BREVO_API_KEY    — a transactional (SMTP API) key
 *   EMAIL_FROM       — the verified sender address, e.g. hello@agency.co.uk
 *   EMAIL_FROM_NAME  — optional display name (defaults to "Luna Work")
 *
 * Unset → emailConfigured() is false and every UI falls back to the old
 * mailto behaviour. Nothing breaks, nothing pretends to send.
 */

const BREVO_URL = "https://api.brevo.com/v3/smtp/email";
const TIMEOUT_MS = 10_000;

export function emailConfigured(): boolean {
  return Boolean(process.env.BREVO_API_KEY && process.env.EMAIL_FROM);
}

export type BrevoSendResult =
  | { ok: true; messageId: string }
  | { ok: false; error: string };

export async function sendViaBrevo(args: {
  toEmail: string;
  toName?: string | null;
  subject: string;
  text: string;
}): Promise<BrevoSendResult> {
  const apiKey = process.env.BREVO_API_KEY;
  const fromEmail = process.env.EMAIL_FROM;
  if (!apiKey || !fromEmail) {
    return { ok: false, error: "Email sending is not configured." };
  }

  try {
    const res = await fetch(BREVO_URL, {
      method: "POST",
      headers: {
        "api-key": apiKey,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        sender: {
          email: fromEmail,
          name: process.env.EMAIL_FROM_NAME || "Luna Work",
        },
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
      // Brevo errors carry a JSON {message}; surface it briefly, never the key.
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
    return { ok: true, messageId: data.messageId ?? "" };
  } catch (err) {
    const timedOut = err instanceof Error && err.name === "TimeoutError";
    return {
      ok: false,
      error: timedOut
        ? "The email provider took too long to answer. The message was not sent — try again."
        : "Could not reach the email provider. The message was not sent.",
    };
  }
}
