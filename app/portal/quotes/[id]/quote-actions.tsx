"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AlertIcon, ArrowRightIcon, CheckIcon, ClockIcon } from "../../icons";
import type { QuoteState } from "@/lib/portal/format";

type Props = {
  quoteId: string;
  tripId: string;
  initialState: QuoteState;
  version: number;
  price: string;
  agencyName: string;
  contactEmail: string | null;
};

type Mode = "idle" | "confirm-accept" | "confirm-decline" | "working";

/**
 * The decision itself. Opening the page records a real customer view (the
 * signal Quote Rescue is built on); accepting and declining each take a
 * confirmation step, then settle into a done state that matches what the
 * server would render on a reload.
 */
export function QuoteActions({
  quoteId,
  tripId,
  initialState,
  version,
  price,
  agencyName,
  contactEmail,
}: Props) {
  const [state, setState] = useState<QuoteState>(initialState);
  const [mode, setMode] = useState<Mode>("idle");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const viewed = useRef(false);

  useEffect(() => {
    if (initialState !== "open" || viewed.current) return;
    viewed.current = true;
    fetch(`/api/portal/quotes/${quoteId}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "view" }),
    }).catch(() => {});
  }, [quoteId, initialState]);

  async function act(action: "accept" | "decline") {
    setMode("working");
    setError(null);
    try {
      const res = await fetch(`/api/portal/quotes/${quoteId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, reason }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; state?: QuoteState };
      if (res.ok && data.ok) {
        setState(action === "accept" ? "accepted" : "declined");
        return;
      }
      if (data.state) setState(data.state);
      setError(data.error || "Something went wrong. Please try again.");
    } catch {
      setError("We couldn't reach the server. Check your connection and try again.");
    }
    setMode("idle");
  }

  const contact = contactEmail ? (
    <a className="p-link" href={`mailto:${contactEmail}`}>
      Email {agencyName}
      <ArrowRightIcon width={14} height={14} />
    </a>
  ) : null;

  if (state === "accepted") {
    return (
      <div className="p-sent" role="status">
        <div className="p-sent-icon">
          <CheckIcon width={18} height={18} />
        </div>
        <div>
          <h3>Booked</h3>
          <p>
            {agencyName} will confirm the details and be in touch about payment. Your trip is now in
            your account.
          </p>
          <p style={{ marginTop: 12 }}>
            <Link className="p-link" href={`/portal/trips/${tripId}`}>
              View your trip
              <ArrowRightIcon width={14} height={14} />
            </Link>
          </p>
        </div>
      </div>
    );
  }

  if (state === "declined") {
    return (
      <div className="p-sent" role="status">
        <div className="p-sent-icon p-sent-icon--muted">
          <CheckIcon width={18} height={18} />
        </div>
        <div>
          <h3>Thanks for letting us know</h3>
          <p>{agencyName} has your answer and will be in touch if there is another way to make it work.</p>
          {contact ? <p style={{ marginTop: 12 }}>{contact}</p> : null}
        </div>
      </div>
    );
  }

  if (state === "expired") {
    return (
      <div className="p-sent" role="status">
        <div className="p-sent-icon p-sent-icon--warn">
          <ClockIcon width={18} height={18} />
        </div>
        <div>
          <h3>This price has expired</h3>
          <p>Prices and availability move. {agencyName} can refresh this quote for you.</p>
          {contact ? <p style={{ marginTop: 12 }}>{contact}</p> : null}
        </div>
      </div>
    );
  }

  if (state === "unavailable") {
    return (
      <div className="p-sent" role="status">
        <div className="p-sent-icon p-sent-icon--muted">
          <ClockIcon width={18} height={18} />
        </div>
        <div>
          <h3>A newer version replaces this</h3>
          <p>Look for the latest quote on your home page, or ask {agencyName}.</p>
        </div>
      </div>
    );
  }

  if (mode === "confirm-accept" || (mode === "working" && !reason)) {
    return (
      <div>
        <div className="p-confirm">
          You are accepting <strong>quote v{version}</strong> at <strong className="tnum">{price}</strong>.{" "}
          {agencyName} will confirm your booking and arrange payment with you.
        </div>
        <button className="p-btn" type="button" disabled={mode === "working"} onClick={() => act("accept")}>
          {mode === "working" ? "Booking…" : "Yes, book this trip"}
        </button>
        <button className="p-btn p-btn--secondary" type="button" disabled={mode === "working"} onClick={() => setMode("idle")}>
          Back
        </button>
        {error ? (
          <div className="p-error" role="alert">
            <AlertIcon width={16} height={16} />
            <span>{error}</span>
          </div>
        ) : null}
      </div>
    );
  }

  if (mode === "confirm-decline" || mode === "working") {
    return (
      <div>
        <label className="p-label" htmlFor="decline-reason" style={{ marginTop: 0 }}>
          Tell {agencyName} why (optional)
        </label>
        <textarea
          id="decline-reason"
          className="p-input p-textarea"
          maxLength={200}
          placeholder="Too soon, dates don't work, over budget…"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <button className="p-btn p-btn--secondary" type="button" disabled={mode === "working"} onClick={() => act("decline")}>
          {mode === "working" ? "Sending…" : "Confirm: not this time"}
        </button>
        <button className="p-btn p-btn--ghost" type="button" disabled={mode === "working"} onClick={() => setMode("idle")}>
          Back
        </button>
        {error ? (
          <div className="p-error" role="alert">
            <AlertIcon width={16} height={16} />
            <span>{error}</span>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div>
      <button className="p-btn" type="button" onClick={() => setMode("confirm-accept")}>
        Accept this quote
        <ArrowRightIcon width={16} height={16} />
      </button>
      <button className="p-btn p-btn--secondary" type="button" onClick={() => setMode("confirm-decline")}>
        Not this time
      </button>
      <p className="p-help">Nothing is charged here. Accepting tells {agencyName} to go ahead and confirm.</p>
      {error ? (
        <div className="p-error" role="alert">
          <AlertIcon width={16} height={16} />
          <span>{error}</span>
        </div>
      ) : null}
    </div>
  );
}
