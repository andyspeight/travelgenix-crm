"use client";

import { useState } from "react";
import { AlertIcon, CheckIcon } from "../icons";

/**
 * The sign-in form, with its full state cycle: idle, sending, sent, and an
 * inline error for the one case the server distinguishes (rate-limited). The
 * "sent" confirmation is identical whether or not the address is on file,
 * mirroring the API's anti-enumeration behaviour.
 */
export function LoginForm({ agency }: { agency?: string }) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "limited">("idle");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    try {
      const res = await fetch("/api/portal/request-link", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(agency ? { email, agency } : { email }),
      });
      if (res.status === 429) {
        setStatus("limited");
        return;
      }
    } catch {
      // Deliberately ignored: the confirmation is the same either way.
    }
    setStatus("sent");
  }

  if (status === "sent") {
    return (
      <div className="p-sent" style={{ marginTop: 28 }} role="status">
        <div className="p-sent-icon">
          <CheckIcon width={18} height={18} />
        </div>
        <div>
          <h3>Check your inbox</h3>
          <p>
            If <strong>{email}</strong> is on file, a secure sign-in link is on its way. It works once
            and expires in 30 minutes.
          </p>
        </div>
      </div>
    );
  }

  const ready = email.includes("@");

  return (
    <form onSubmit={submit} noValidate>
      <label className="p-label" htmlFor="portal-email">
        Email address
      </label>
      <input
        id="portal-email"
        className="p-input"
        type="email"
        required
        autoComplete="email"
        inputMode="email"
        placeholder="you@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      {status === "limited" ? (
        <div className="p-error" role="alert">
          <AlertIcon width={16} height={16} />
          <span>Too many attempts just now. Wait a moment, then try again.</span>
        </div>
      ) : null}
      <button className="p-btn" type="submit" disabled={status === "sending" || !ready}>
        {status === "sending" ? "Sending your link…" : "Email me a link"}
      </button>
      <p className="p-help">We only ever send it to an address already on file.</p>
    </form>
  );
}
