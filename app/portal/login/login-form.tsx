"use client";

import { useState } from "react";

/**
 * The login form. Always shows the same "check your email" confirmation on
 * submit, mirroring the API's anti-enumeration behaviour — the customer never
 * learns from the UI whether their address is on file.
 */
export function LoginForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    try {
      await fetch("/api/portal/request-link", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
    } catch {
      // Deliberately ignored — the confirmation is the same either way.
    }
    setStatus("sent");
  }

  if (status === "sent") {
    return (
      <div>
        <p style={{ margin: 0, fontWeight: 600 }}>Check your email</p>
        <p className="portal-note">
          If <strong>{email}</strong> is on file, a secure sign-in link is on its way. It
          works once and expires in 30 minutes.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit}>
      <input
        className="portal-input"
        type="email"
        required
        placeholder="you@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        autoComplete="email"
        aria-label="Email address"
      />
      <button className="portal-btn" type="submit" disabled={status === "sending"}>
        {status === "sending" ? "Sending…" : "Email me a link"}
      </button>
      <p className="portal-note">
        We&apos;ll email you a one-time sign-in link — no password to remember.
      </p>
    </form>
  );
}
