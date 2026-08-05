"use client";

/**
 * Quotes list + the Quote Rescue strip.
 *
 * Rescue alerts (computed server-side, deterministic) sit on top — each one
 * says what's wrong, why, and the single best intervention. Below, the full
 * quote book with status tabs and the lifecycle actions: send, log a view,
 * record the customer's reply, accept (books the trip), decline, extend.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Quote } from "@/lib/supabase/types";
import type { RescueAlert } from "@/lib/quotes/rescue";
import { SparklesIcon, SendIcon, CheckIcon, XIcon, ClockIcon } from "@/components/ui/icons";

export type QuotesViewProps = {
  quotes: Quote[];
  alerts: RescueAlert[];
  nameById: Record<string, string>;
  tripMeta: Record<string, { destination: string | null; depart_date: string | null }>;
};

type Tab = "live" | "accepted" | "declined" | "all";

const TABS: { key: Tab; label: string }[] = [
  { key: "live", label: "Live" },
  { key: "accepted", label: "Accepted" },
  { key: "declined", label: "Declined" },
  { key: "all", label: "All" },
];

const STATUS_META: Record<string, { label: string; bg: string; fg: string }> = {
  draft: { label: "Draft", bg: "var(--bg-subtle)", fg: "var(--text-muted)" },
  sent: { label: "Sent", bg: "rgba(0, 180, 216, 0.12)", fg: "var(--tg-accent-dark)" },
  viewed: { label: "Viewed", bg: "rgba(139, 92, 246, 0.12)", fg: "#8b5cf6" },
  accepted: { label: "Accepted", bg: "rgba(5, 150, 105, 0.12)", fg: "#059669" },
  declined: { label: "Declined", bg: "rgba(220, 38, 38, 0.10)", fg: "#dc2626" },
  expired: { label: "Expired", bg: "rgba(217, 119, 6, 0.12)", fg: "#d97706" },
  superseded: { label: "Superseded", bg: "var(--bg-subtle)", fg: "var(--text-subtle)" },
};

const SEVERITY_COLOUR: Record<number, string> = {
  3: "#dc2626",
  2: "#d97706",
  1: "var(--tg-accent-dark)",
};

const fmtMoney = (n: number | null): string =>
  n != null ? `£${Math.round(n).toLocaleString("en-GB")}` : "—";

const fmtDate = (iso: string | null): string | null =>
  iso
    ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
    : null;

export function QuotesView({ quotes, alerts, nameById, tripMeta }: QuotesViewProps) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("live");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [prompting, setPrompting] = useState<{ id: string; kind: "decline" | "respond" | "extend" } | null>(null);
  const [promptValue, setPromptValue] = useState("");

  const counts = useMemo(() => {
    const live = quotes.filter((q) => ["draft", "sent", "viewed", "expired"].includes(q.status)).length;
    return {
      live,
      accepted: quotes.filter((q) => q.status === "accepted").length,
      declined: quotes.filter((q) => q.status === "declined").length,
      all: quotes.length,
    } as Record<Tab, number>;
  }, [quotes]);

  const visible = useMemo(
    () =>
      quotes.filter((q) => {
        if (tab === "all") return true;
        if (tab === "live") return ["draft", "sent", "viewed", "expired"].includes(q.status);
        return q.status === tab;
      }),
    [quotes, tab]
  );

  const alertByQuote = useMemo(() => new Map(alerts.map((a) => [a.quoteId, a])), [alerts]);

  async function act(id: string, action: string, extra: Record<string, unknown> = {}) {
    setError(null);
    setBusyId(id);
    try {
      const res = await fetch(`/api/quotes/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error || `Failed (${res.status})`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusyId(null);
      setPrompting(null);
      setPromptValue("");
    }
  }

  function submitPrompt(q: Quote) {
    if (!prompting) return;
    if (prompting.kind === "decline") void act(q.id, "decline", { declined_reason: promptValue });
    if (prompting.kind === "respond") void act(q.id, "respond", { customer_response: promptValue });
    if (prompting.kind === "extend") void act(q.id, "extend", { expires_at: promptValue });
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
      {/* ─── Quote Rescue strip ─── */}
      {alerts.length > 0 && (
        <section
          data-tour="quotes-rescue"
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 14,
            padding: 18,
            marginBottom: 18,
            boxShadow: "var(--shadow-sm)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <SparklesIcon width={15} height={15} style={{ color: "var(--tg-accent-dark)" }} />
            <span style={{ fontSize: 13.5, fontWeight: 700, color: "var(--text)" }}>
              Luna · Quote rescue
            </span>
            <span style={{ fontSize: 11.5, color: "var(--text-subtle)" }}>
              {alerts.length} at risk · every alert is computed from the record, never guessed
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {alerts.slice(0, 6).map((a) => (
              <div
                key={a.quoteId}
                style={{
                  display: "flex",
                  gap: 10,
                  padding: "10px 12px",
                  borderRadius: 10,
                  background: "var(--bg-subtle)",
                  borderLeft: `3px solid ${SEVERITY_COLOUR[a.severity]}`,
                  alignItems: "flex-start",
                  flexWrap: "wrap",
                }}
              >
                <div style={{ flex: 1, minWidth: 260 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>
                    {a.title}
                    {a.householdId && nameById[a.householdId] && (
                      <Link
                        href={`/customers/${a.householdId}`}
                        style={{ marginLeft: 8, fontSize: 11.5, color: "var(--tg-primary)", textDecoration: "none", fontWeight: 600 }}
                      >
                        {nameById[a.householdId]} ↗
                      </Link>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 3, lineHeight: 1.5 }}>
                    {a.reason}
                  </div>
                </div>
                <span
                  style={{
                    fontSize: 11.5,
                    fontWeight: 700,
                    color: SEVERITY_COLOUR[a.severity],
                    background: "var(--surface)",
                    border: `1px solid ${SEVERITY_COLOUR[a.severity]}33`,
                    borderRadius: 6,
                    padding: "3px 9px",
                    whiteSpace: "nowrap",
                  }}
                >
                  {a.actionLabel}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ─── Tabs ─── */}
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

      {error && <div style={{ marginBottom: 12, fontSize: 12.5, color: "var(--error)" }}>{error}</div>}

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
          No quotes here yet. Raise one with New quote, against any trip still at enquiry or quoted.
        </div>
      )}

      {/* ─── Quote rows ─── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {visible.map((q) => {
          const meta = STATUS_META[q.status] ?? STATUS_META.draft;
          const trip = tripMeta[q.trip_id];
          const alert = alertByQuote.get(q.id);
          const busy = busyId === q.id;
          const isLive = ["sent", "viewed", "expired"].includes(q.status);
          const householdName = q.household_id ? nameById[q.household_id] : null;

          return (
            <div
              key={q.id}
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: 12,
                padding: "14px 16px",
              }}
            >
              <div style={{ display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 240 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 15, fontWeight: 700, color: "var(--text)" }}>
                      {fmtMoney(q.total_price)}
                    </span>
                    <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
                      {trip?.destination ?? "Destination TBC"}
                    </span>
                    <span
                      style={{
                        background: meta.bg,
                        color: meta.fg,
                        borderRadius: 5,
                        padding: "2px 8px",
                        fontSize: 10.5,
                        fontWeight: 700,
                      }}
                    >
                      {meta.label}
                    </span>
                    {q.version > 1 && (
                      <span style={{ fontSize: 10.5, fontWeight: 600, color: "var(--text-subtle)" }}>
                        v{q.version}
                      </span>
                    )}
                    {householdName && q.household_id && (
                      <Link
                        href={`/customers/${q.household_id}`}
                        style={{ fontSize: 11.5, color: "var(--tg-primary)", textDecoration: "none", fontWeight: 600 }}
                      >
                        {householdName} ↗
                      </Link>
                    )}
                  </div>

                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 6, fontSize: 11.5, color: "var(--text-muted)" }}>
                    {q.sent_at && <span>sent {fmtDate(q.sent_at)}</span>}
                    {q.expires_at && <span>expires {fmtDate(q.expires_at)}</span>}
                    {q.view_count > 0 && (
                      <span style={{ fontWeight: 600, color: "#8b5cf6" }}>
                        viewed {q.view_count} time{q.view_count === 1 ? "" : "s"}
                      </span>
                    )}
                    {trip?.depart_date && <span>departs {fmtDate(trip.depart_date)}</span>}
                    {q.deposit != null && <span>deposit {fmtMoney(q.deposit)}</span>}
                    {q.expected_margin != null && <span>margin {fmtMoney(q.expected_margin)}</span>}
                  </div>

                  {q.options_summary && (
                    <div style={{ marginTop: 6, fontSize: 12.5, color: "var(--text-muted)", lineHeight: 1.5 }}>
                      {q.options_summary}
                    </div>
                  )}
                  {q.customer_response && (
                    <div style={{ marginTop: 6, fontSize: 12, color: "var(--text)", fontStyle: "italic" }}>
                      Customer: &ldquo;{q.customer_response}&rdquo;
                    </div>
                  )}
                  {q.status === "declined" && q.declined_reason && (
                    <div style={{ marginTop: 6, fontSize: 11.5, color: "var(--text-subtle)" }}>
                      Declined: {q.declined_reason}
                    </div>
                  )}
                  {alert && (
                    <div style={{ marginTop: 7, fontSize: 11.5, fontWeight: 600, color: SEVERITY_COLOUR[alert.severity] }}>
                      ⚠ {alert.title} — {alert.actionLabel.toLowerCase()}
                    </div>
                  )}
                </div>
              </div>

              {/* Actions */}
              {(q.status === "draft" || isLive) && (
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
                  {q.status === "draft" && (
                    <button
                      onClick={() => act(q.id, "send")}
                      disabled={busy}
                      style={{ ...btn, background: "var(--tg-primary)", border: "1px solid var(--tg-primary)", color: "white", fontWeight: 600, opacity: busy ? 0.6 : 1 }}
                    >
                      <SendIcon width={12} height={12} /> Mark as sent
                    </button>
                  )}
                  {isLive && (
                    <>
                      <button onClick={() => act(q.id, "record_view")} disabled={busy} title="The customer opened the quote" style={{ ...btn, opacity: busy ? 0.6 : 1 }}>
                        Log a view
                      </button>
                      <button
                        onClick={() => act(q.id, "accept")}
                        disabled={busy}
                        title="Accepting books the trip at this price"
                        style={{ ...btn, color: "#059669", borderColor: "rgba(5,150,105,0.4)", opacity: busy ? 0.6 : 1 }}
                      >
                        <CheckIcon width={12} height={12} /> Accepted, book it
                      </button>
                      {prompting?.id === q.id ? (
                        <span style={{ display: "inline-flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                          <input
                            autoFocus
                            type={prompting.kind === "extend" ? "date" : "text"}
                            value={promptValue}
                            onChange={(ev) => setPromptValue(ev.target.value)}
                            onKeyDown={(ev) => {
                              if (ev.key === "Enter") submitPrompt(q);
                              if (ev.key === "Escape") setPrompting(null);
                            }}
                            placeholder={
                              prompting.kind === "decline"
                                ? "Why did they decline?"
                                : "What did the customer say?"
                            }
                            style={{
                              border: "1px solid var(--border)",
                              borderRadius: 6,
                              background: "var(--surface)",
                              color: "var(--text)",
                              padding: "5px 9px",
                              fontSize: 12,
                              width: prompting.kind === "extend" ? 150 : 230,
                              fontFamily: "inherit",
                            }}
                          />
                          <button onClick={() => submitPrompt(q)} disabled={busy} style={{ ...btn, opacity: busy ? 0.6 : 1 }}>
                            Save
                          </button>
                          <button onClick={() => setPrompting(null)} style={{ ...btn, border: "none" }}>
                            Cancel
                          </button>
                        </span>
                      ) : (
                        <>
                          <button onClick={() => { setPrompting({ id: q.id, kind: "respond" }); setPromptValue(""); }} disabled={busy} style={{ ...btn, opacity: busy ? 0.6 : 1 }}>
                            Log their reply
                          </button>
                          <button onClick={() => { setPrompting({ id: q.id, kind: "extend" }); setPromptValue(""); }} disabled={busy} style={{ ...btn, opacity: busy ? 0.6 : 1 }}>
                            <ClockIcon width={11} height={11} /> Extend expiry
                          </button>
                          <button onClick={() => { setPrompting({ id: q.id, kind: "decline" }); setPromptValue(""); }} disabled={busy} style={{ ...btn, opacity: busy ? 0.6 : 1 }}>
                            <XIcon width={11} height={11} /> Declined
                          </button>
                        </>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
