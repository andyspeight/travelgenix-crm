"use client";

/**
 * Enquiries list — the working half of /enquiries.
 *
 * Owns the status tabs, the live first-response clocks (ticking every 30s),
 * the four qualification pills and the respond / convert / close actions.
 * Rows needing a response sort by clock pressure: overdue first (most over
 * first), then least time left.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Enquiry, EnquiryScore } from "@/lib/supabase/types";
import { clockState, type Clock } from "@/lib/enquiries/clock";
import type { EnrichmentFact } from "@/lib/enrich/enquiry";
import { MessageIcon, SendIcon, PlaneIcon, XIcon, SparklesIcon } from "@/components/ui/icons";
import { EmailComposer } from "@/components/email/composer";

export type EnquiriesViewProps = {
  enquiries: Enquiry[];
  nameById: Record<string, string>;
  /** True when the server has a configured email provider — replies send for real. */
  emailLive: boolean;
  /** What Luna worked out about each enquiry, keyed by enquiry id. */
  enrichment: Record<string, EnrichmentFact[]>;
};

type Tab = "needs_response" | "responded" | "converted" | "closed" | "all";

const TABS: { key: Tab; label: string }[] = [
  { key: "needs_response", label: "Needs response" },
  { key: "responded", label: "Responded" },
  { key: "converted", label: "Converted" },
  { key: "closed", label: "Closed" },
  { key: "all", label: "All" },
];

const CLOCK_COLOURS: Record<Clock["state"], { bg: string; fg: string }> = {
  overdue: { bg: "rgba(220, 38, 38, 0.12)", fg: "#dc2626" },
  warning: { bg: "rgba(217, 119, 6, 0.12)", fg: "#d97706" },
  ok: { bg: "rgba(5, 150, 105, 0.10)", fg: "#059669" },
  responded: { bg: "var(--bg-subtle)", fg: "var(--text-muted)" },
};

function fmtDate(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso + (iso.length === 10 ? "T00:00:00" : "")).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function partyLabel(e: Enquiry): string | null {
  const bits: string[] = [];
  if (e.adults) bits.push(`${e.adults} adult${e.adults > 1 ? "s" : ""}`);
  if (e.children) bits.push(`${e.children} child${e.children > 1 ? "ren" : ""}`);
  return bits.length ? bits.join(", ") : null;
}

function budgetLabel(e: Enquiry): string | null {
  if (e.budget == null) return null;
  const amount = `£${Math.round(e.budget).toLocaleString("en-GB")}`;
  return e.budget_basis === "per_person" ? `${amount} pp` : amount;
}

// ─── Score pill ─────────────────────────────────────────────────────────────
// One letter per dimension, colour by band, full reason on hover. Null score
// renders muted with its honest reason.

function ScorePill({ letter, title, s }: { letter: string; title: string; s: EnquiryScore }) {
  const colour =
    s.score == null
      ? { bg: "var(--bg-subtle)", fg: "var(--text-subtle)" }
      : s.score >= 70
        ? { bg: "rgba(5, 150, 105, 0.12)", fg: "#059669" }
        : s.score >= 45
          ? { bg: "rgba(217, 119, 6, 0.12)", fg: "#d97706" }
          : { bg: "rgba(100, 116, 139, 0.12)", fg: "var(--text-muted)" };
  return (
    <span
      title={`${title}: ${s.score ?? "—"}. ${s.reason}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 3,
        background: colour.bg,
        color: colour.fg,
        borderRadius: 5,
        padding: "2px 6px",
        fontSize: 10.5,
        fontWeight: 700,
        fontFamily: '"JetBrains Mono", monospace',
        cursor: "help",
      }}
    >
      {letter}
      <span style={{ fontWeight: 600 }}>{s.score ?? "—"}</span>
    </span>
  );
}

export function EnquiriesView({ enquiries, nameById, emailLive, enrichment }: EnquiriesViewProps) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("needs_response");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [closingId, setClosingId] = useState<string | null>(null);
  const [closeReason, setCloseReason] = useState("");

  // The clocks and their ordering re-evaluate on a 30-second tick, so a tab
  // left open does not freeze "38m left" at whatever it said on load. `nowIso`
  // feeds the memoised sort, so bumping it re-sorts too.
  const [nowIso, setNowIso] = useState(() => new Date().toISOString());
  useEffect(() => {
    const t = setInterval(() => setNowIso(new Date().toISOString()), 30_000);
    return () => clearInterval(t);
  }, []);

  const counts = useMemo(() => {
    const c: Record<Tab, number> = { needs_response: 0, responded: 0, converted: 0, closed: 0, all: enquiries.length };
    for (const e of enquiries) {
      if (e.status === "new") c.needs_response++;
      else if (e.status === "responded") c.responded++;
      else if (e.status === "converted") c.converted++;
      else if (e.status === "closed") c.closed++;
    }
    return c;
  }, [enquiries]);

  const visible = useMemo(() => {
    const filtered = enquiries.filter((e) => {
      if (tab === "all") return true;
      if (tab === "needs_response") return e.status === "new";
      return e.status === tab;
    });
    if (tab === "needs_response") {
      // Clock pressure order: most overdue first, then least time left.
      return filtered
        .map((e) => ({
          e,
          clock: clockState({
            receivedAt: e.received_at,
            dueAt: e.first_response_due_at,
            respondedAt: e.first_response_at,
            now: nowIso,
          }),
        }))
        .sort((a, b) => a.clock.remainingMs - b.clock.remainingMs)
        .map((x) => x.e);
    }
    return filtered;
  }, [enquiries, tab, nowIso]);

  async function act(id: string, action: "respond" | "convert" | "close", lostReason?: string) {
    setError(null);
    setBusyId(id);
    try {
      const res = await fetch(`/api/enquiries/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, lost_reason: lostReason }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        household_id?: string;
      };
      if (!res.ok || !data.ok) throw new Error(data.error || `Failed (${res.status})`);
      if (action === "convert" && data.household_id) {
        router.push(`/customers/${data.household_id}`);
        return;
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusyId(null);
      setClosingId(null);
      setCloseReason("");
    }
  }

  // Inline composer (real sending). Opened per enquiry, like closingId.
  const [replyingId, setReplyingId] = useState<string | null>(null);
  const [replySubject, setReplySubject] = useState("");

  function respond(e: Enquiry) {
    if (emailLive && e.contact_email) {
      // Real sending: open the inline composer; the clock stops when it sends.
      setReplyingId(e.id);
      setReplySubject(`Your ${e.destination ?? "holiday"} enquiry`);
      return;
    }
    // No provider (or no address): the old flow — mailto when we can, then
    // stop the clock.
    if (e.contact_email) {
      const subject = encodeURIComponent(
        `Your ${e.destination ?? "holiday"} enquiry`
      );
      window.open(`mailto:${e.contact_email}?subject=${subject}`, "_self");
    }
    void act(e.id, "respond");
  }

  const btn: React.CSSProperties = {
    background: "transparent",
    border: "1px solid var(--border)",
    borderRadius: 6,
    padding: "5px 10px",
    fontSize: 12,
    fontWeight: 500,
    color: "var(--text-muted)",
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
  };

  return (
    <div style={{ padding: "20px 24px" }}>
      {/* Tabs */}
      <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
        {TABS.map(({ key, label }) => {
          const active = tab === key;
          return (
            <button
              key={key}
              onClick={() => setTab(key)}
              style={{
                background: active ? "var(--tg-primary)" : "var(--surface)",
                color: active ? "white" : "var(--text-muted)",
                border: `1px solid ${active ? "var(--tg-primary)" : "var(--border)"}`,
                borderRadius: 999,
                padding: "5px 12px",
                fontSize: 12.5,
                fontWeight: active ? 600 : 500,
                cursor: "pointer",
              }}
            >
              {label}
              <span style={{ opacity: 0.75, marginLeft: 5, fontSize: 11 }}>{counts[key]}</span>
            </button>
          );
        })}
      </div>

      {error && (
        <div style={{ marginBottom: 12, fontSize: 12.5, color: "var(--error)" }}>{error}</div>
      )}

      {/* Empty state */}
      {visible.length === 0 && (
        <div
          style={{
            border: "1px dashed var(--border)",
            borderRadius: 12,
            padding: "48px 24px",
            textAlign: "center",
            color: "var(--text-subtle)",
            fontSize: 13.5,
          }}
        >
          <MessageIcon width={22} height={22} style={{ opacity: 0.5, marginBottom: 8 }} />
          <div>
            {tab === "needs_response"
              ? "Nothing waiting. Every enquiry has been answered."
              : "No enquiries here yet."}
          </div>
          {tab === "needs_response" && (
            <div style={{ marginTop: 4, fontSize: 12.5 }}>
              New enquiries land here with a response clock running.
            </div>
          )}
        </div>
      )}

      {/* Rows */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {visible.map((e) => {
          const clock = clockState({
            receivedAt: e.received_at,
            dueAt: e.first_response_due_at,
            respondedAt: e.first_response_at,
            now: nowIso,
          });
          const clockColour = CLOCK_COLOURS[clock.state];
          const busy = busyId === e.id;
          const householdName = e.household_id ? nameById[e.household_id] : null;
          const chips = [
            e.destination,
            fmtDate(e.depart_date),
            e.duration_nights ? `${e.duration_nights} nights` : null,
            partyLabel(e),
            budgetLabel(e),
            e.holiday_type,
            e.departure_airport ? `from ${e.departure_airport}` : null,
          ].filter(Boolean) as string[];

          return (
            <div
              key={e.id}
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: 12,
                padding: "14px 16px",
              }}
            >
              <div style={{ display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                {/* Who + what */}
                <div style={{ flex: 1, minWidth: 240 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>
                      {e.contact_name ?? "Unknown"}
                    </span>
                    {householdName && e.household_id && (
                      <Link
                        href={`/customers/${e.household_id}`}
                        style={{
                          fontSize: 11.5,
                          color: "var(--tg-primary)",
                          textDecoration: "none",
                          fontWeight: 600,
                        }}
                      >
                        {householdName} ↗
                      </Link>
                    )}
                    {e.ai_extracted && (
                      <span
                        title="Fields read from the original message by Luna, reviewed by an agent"
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 3,
                          fontSize: 10,
                          fontWeight: 600,
                          color: "var(--tg-accent-dark)",
                          background: "rgba(0, 180, 216, 0.10)",
                          borderRadius: 4,
                          padding: "1px 6px",
                        }}
                      >
                        <SparklesIcon width={9} height={9} /> Luna read
                      </span>
                    )}
                    <span style={{ fontSize: 11, color: "var(--text-subtle)" }}>
                      {e.source ? e.source.replace("_", " ") : "manual"} ·{" "}
                      {new Date(e.received_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                    </span>
                  </div>

                  {/* Structured chips */}
                  {chips.length > 0 && (
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 7 }}>
                      {chips.map((c) => (
                        <span
                          key={c}
                          style={{
                            fontSize: 11.5,
                            color: "var(--text-muted)",
                            background: "var(--bg-subtle)",
                            border: "1px solid var(--border)",
                            borderRadius: 5,
                            padding: "2px 7px",
                          }}
                        >
                          {c}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Summary or wording */}
                  {(e.ai_summary || e.original_wording) && (
                    <div
                      style={{
                        marginTop: 7,
                        fontSize: 12.5,
                        color: "var(--text-muted)",
                        lineHeight: 1.5,
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                      }}
                      title={e.original_wording ?? undefined}
                    >
                      {e.ai_summary ?? e.original_wording}
                    </div>
                  )}

                  {e.status === "closed" && e.lost_reason && (
                    <div style={{ marginTop: 6, fontSize: 11.5, color: "var(--text-subtle)" }}>
                      Closed: {e.lost_reason}
                    </div>
                  )}
                </div>

                {/* Scores + clock */}
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
                  <span
                    style={{
                      background: clockColour.bg,
                      color: clockColour.fg,
                      borderRadius: 6,
                      padding: "3px 9px",
                      fontSize: 11.5,
                      fontWeight: 700,
                    }}
                  >
                    {clock.label}
                  </span>
                  {e.scores && (
                    <div style={{ display: "flex", gap: 4 }}>
                      <ScorePill letter="L" title="Likelihood to book" s={e.scores.likelihood} />
                      <ScorePill letter="V" title="Potential value" s={e.scores.value} />
                      <ScorePill letter="U" title="Urgency" s={e.scores.urgency} />
                      <ScorePill letter="F" title="Relationship fit" s={e.scores.fit} />
                    </div>
                  )}
                </div>
              </div>

              {/* What Luna noticed about this enquiry */}
              {(enrichment[e.id]?.length ?? 0) > 0 && (
                <div
                  style={{
                    marginTop: 10,
                    paddingTop: 10,
                    borderTop: "1px solid var(--border)",
                    display: "flex",
                    flexDirection: "column",
                    gap: 7,
                  }}
                >
                  {enrichment[e.id].map((f, idx) => (
                    <div key={idx} style={{ display: "flex", gap: 8 }}>
                      <span
                        aria-hidden
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: "50%",
                          marginTop: 6,
                          flexShrink: 0,
                          background:
                            f.tone === "warn" ? "var(--warning)" : "var(--tg-accent-dark)",
                        }}
                      />
                      <div style={{ minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: 12.5,
                            fontWeight: 600,
                            color: f.tone === "warn" ? "var(--text)" : "var(--text-muted)",
                          }}
                        >
                          {f.headline}
                        </div>
                        <div style={{ fontSize: 11.5, color: "var(--text-muted)", lineHeight: 1.5 }}>
                          {f.detail}
                        </div>
                        <div
                          style={{ fontSize: 10.5, color: "var(--text-subtle)", marginTop: 1 }}
                          title="Where this came from — check it, don't take our word for it"
                        >
                          {f.source}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Actions */}
              {(e.status === "new" || e.status === "responded") && (
                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    marginTop: 12,
                    paddingTop: 12,
                    borderTop: "1px solid var(--border)",
                    flexWrap: "wrap",
                    alignItems: "center",
                  }}
                >
                  {e.status === "new" && (
                    <button
                      onClick={() => respond(e)}
                      disabled={busy}
                      title={
                        e.contact_email
                          ? emailLive
                            ? `Write and genuinely send a reply to ${e.contact_email} — the clock stops when it sends`
                            : `Open a reply to ${e.contact_email} and stop the clock`
                          : "Mark as responded (no email on file — reply by phone)"
                      }
                      style={{ ...btn, background: "var(--tg-primary)", border: "1px solid var(--tg-primary)", color: "white", fontWeight: 600, opacity: busy ? 0.6 : 1 }}
                    >
                      <SendIcon width={12} height={12} />
                      {e.contact_email ? "Respond now" : "Mark responded"}
                    </button>
                  )}
                  <button
                    onClick={() => act(e.id, "convert")}
                    disabled={busy}
                    title="Create the customer record (if new) and a trip in the pipeline"
                    style={{ ...btn, opacity: busy ? 0.6 : 1 }}
                  >
                    <PlaneIcon width={12} height={12} />
                    Convert to trip
                  </button>
                  {closingId === e.id ? (
                    <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                      <input
                        autoFocus
                        value={closeReason}
                        onChange={(ev) => setCloseReason(ev.target.value)}
                        onKeyDown={(ev) => {
                          if (ev.key === "Enter") void act(e.id, "close", closeReason);
                          if (ev.key === "Escape") setClosingId(null);
                        }}
                        placeholder="Why was it lost? e.g. booked elsewhere"
                        style={{
                          border: "1px solid var(--border)",
                          borderRadius: 6,
                          background: "var(--surface)",
                          color: "var(--text)",
                          padding: "5px 9px",
                          fontSize: 12,
                          width: 230,
                          fontFamily: "inherit",
                        }}
                      />
                      <button onClick={() => act(e.id, "close", closeReason)} disabled={busy} style={{ ...btn, opacity: busy ? 0.6 : 1 }}>
                        Close it
                      </button>
                      <button onClick={() => setClosingId(null)} style={{ ...btn, border: "none" }}>
                        Cancel
                      </button>
                    </span>
                  ) : (
                    <button
                      onClick={() => { setClosingId(e.id); setCloseReason(""); }}
                      disabled={busy}
                      title="Close with a lost reason"
                      style={{ ...btn, opacity: busy ? 0.6 : 1 }}
                    >
                      <XIcon width={11} height={11} />
                      Close
                    </button>
                  )}
                </div>
              )}

              {/* The composer — one component, everywhere the CRM sends */}
              {replyingId === e.id && (
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
                  <EmailComposer
                    toLabel={e.contact_name ?? e.contact_email ?? "this customer"}
                    toEmail={e.contact_email}
                    householdId={e.household_id ?? undefined}
                    enquiryId={e.id}
                    defaultSubject={replySubject}
                    context="enquiry_response"
                    emailLive={emailLive}
                    note="sends for real and stops the response clock"
                    onSent={() => {
                      setReplyingId(null);
                      // The clock only stops after a real send.
                      void act(e.id, "respond");
                    }}
                    onCancel={() => setReplyingId(null)}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
