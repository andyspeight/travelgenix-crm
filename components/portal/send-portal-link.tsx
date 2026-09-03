"use client";

import { useState } from "react";
import { SendIcon, CheckIcon } from "@/components/ui/icons";

/**
 * "Email the customer a link" — the agent's way of opening the portal's front
 * door. One button, four states, and it says plainly what happened. Which of
 * the three messages goes out is the server's call, from the record's state:
 * a new quote, a nudge on one they have read, or a booking confirmation.
 */
export function SendPortalLink({
  kind,
  id,
  label = "Email portal link",
  compact = false,
}: {
  kind: "quote" | "trip";
  id: string;
  label?: string;
  compact?: boolean;
}) {
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function send() {
    setState("sending");
    setMessage(null);
    try {
      const res = await fetch("/api/portal/invite", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind, id }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        sentTo?: string;
      };
      if (res.ok && data.ok) {
        setState("sent");
        setMessage(data.sentTo ? `Sent to ${data.sentTo}` : "Sent");
        return;
      }
      setState("error");
      setMessage(data.error || "Couldn't send the link.");
    } catch {
      setState("error");
      setMessage("Couldn't reach the server.");
    }
  }

  const base: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    height: compact ? 24 : 28,
    padding: compact ? "0 8px" : "0 11px",
    fontSize: compact ? 11 : 12,
    fontWeight: 500,
    fontFamily: "inherit",
    border: "1px solid var(--border)",
    borderRadius: 6,
    background: "transparent",
    color: "var(--text-muted)",
    cursor: state === "sending" ? "default" : "pointer",
    opacity: state === "sending" ? 0.6 : 1,
  };

  if (state === "sent") {
    return (
      <span
        style={{ ...base, color: "var(--success)", borderColor: "rgba(16,185,129,0.35)" }}
        role="status"
      >
        <CheckIcon width={12} height={12} />
        {message}
      </span>
    );
  }

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <button type="button" onClick={() => void send()} disabled={state === "sending"} style={base}>
        <SendIcon width={12} height={12} />
        {state === "sending" ? "Sending" : label}
      </button>
      {state === "error" && message ? (
        <span role="alert" style={{ fontSize: 11, color: "var(--error)" }}>
          {message}
        </span>
      ) : null}
    </span>
  );
}
