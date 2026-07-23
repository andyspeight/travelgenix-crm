"use client";

/**
 * Luna Ask — floating assistant. A button bottom-right opens a command bar.
 * Ask a plain-English question, get back the three layers:
 *   1. Luna insight (the "so what", shown prominently at the top)
 *   2. the structured output (list / number)
 *   3. clickable rows through to records
 *
 * v1 invocation: floating button + Cmd/Ctrl+K to open. We can swap the style
 * after seeing it live.
 */

import { useState, useEffect, useRef, useCallback } from "react";

type Signal = { kind: string; detail: string; severity?: string };
type Row = { id: string; href?: string; title: string; subtitle?: string; badges?: string[] };
type Result = {
  shape: "list" | "number" | "table" | "empty";
  summary: string;
  value?: string;
  rows?: Row[];
  signals: Signal[];
  actionable: boolean;
};
type AskResponse = {
  ok: boolean;
  question: string;
  tool?: string;
  result?: Result;
  insight?: string;
  error?: string;
};

const EXAMPLES = [
  "Who's travelling in the next 3 months?",
  "Tell me about Sarah Thompson",
  "Build me a report for this year",
  "Which customers have gone quiet?",
];

type AskTurn = { q: string; a: string };

export function LunaAsk() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [answer, setAnswer] = useState<AskResponse | null>(null);
  // Prior turns in this thread — sent with the next question so follow-ups
  // like "and just the VIPs?" resolve in context.
  const [history, setHistory] = useState<AskTurn[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  // Draggable button position. null = default (bottom-right). Once dragged,
  // we store an explicit {x, y} in viewport pixels.
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const dragState = useRef<{ dragging: boolean; moved: boolean; offX: number; offY: number }>({
    dragging: false,
    moved: false,
    offX: 0,
    offY: 0,
  });

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    dragState.current = {
      dragging: true,
      moved: false,
      offX: e.clientX - rect.left,
      offY: e.clientY - rect.top,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    if (!dragState.current.dragging) return;
    // Treat as a drag once it moves a few px (so a click still opens it).
    dragState.current.moved = true;
    const x = e.clientX - dragState.current.offX;
    const y = e.clientY - dragState.current.offY;
    // Keep it within the viewport.
    const maxX = window.innerWidth - 60;
    const maxY = window.innerHeight - 60;
    setPos({
      x: Math.max(8, Math.min(x, maxX)),
      y: Math.max(8, Math.min(y, maxY)),
    });
  }, []);

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    const wasDrag = dragState.current.moved;
    dragState.current.dragging = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    // Only open if it was a click, not a drag.
    if (!wasDrag) setOpen(true);
  }, []);

  // Cmd/Ctrl+K to open, Esc to close.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  const ask = useCallback(async (question: string) => {
    if (!question.trim()) return;
    setLoading(true);
    setAnswer(null);
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, history }),
      });
      const data = (await res.json()) as AskResponse;
      setAnswer(data);
      // Record the turn (question + the short factual answer) for follow-ups.
      const a = data.insight || data.result?.summary || data.error || "";
      if (data.ok && a) {
        setHistory((h) => [...h.slice(-3), { q: question, a }]);
      }
      setQ("");
      inputRef.current?.focus();
    } catch {
      setAnswer({ ok: false, question, error: "Something went wrong. Try again." });
    } finally {
      setLoading(false);
    }
  }, [history]);

  const resetThread = useCallback(() => {
    setHistory([]);
    setAnswer(null);
    setQ("");
    inputRef.current?.focus();
  }, []);

  return (
    <>
      {/* Floating button — draggable, with an Alexa/Siri-style glow + pulse */}
      {!open && (
        <>
          <style>{`
            @keyframes lunaPulse {
              0%   { box-shadow: 0 0 0 0 rgba(0,180,216,0.55), 0 8px 24px rgba(0,0,0,0.18); }
              70%  { box-shadow: 0 0 0 14px rgba(0,180,216,0), 0 8px 24px rgba(0,0,0,0.18); }
              100% { box-shadow: 0 0 0 0 rgba(0,180,216,0), 0 8px 24px rgba(0,0,0,0.18); }
            }
            @keyframes lunaGlow {
              0%, 100% { filter: drop-shadow(0 0 6px rgba(0,180,216,0.6)); }
              50%      { filter: drop-shadow(0 0 16px rgba(0,180,216,0.9)); }
            }
            .luna-fab {
              animation: lunaPulse 2.6s ease-out infinite, lunaGlow 2.6s ease-in-out infinite;
            }
            .luna-fab:hover { animation-play-state: paused; }
            @media (prefers-reduced-motion: reduce) {
              .luna-fab { animation: none; }
            }
          `}</style>
          <button
            className="luna-fab"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            aria-label="Ask Luna"
            style={{
              position: "fixed",
              ...(pos
                ? { left: pos.x, top: pos.y, bottom: "auto", right: "auto" }
                : { bottom: 24, right: 24 }),
              zIndex: 900,
              display: "flex",
              alignItems: "center",
              gap: 9,
              background: "linear-gradient(135deg, var(--tg-primary), var(--tg-accent))",
              color: "white",
              border: "none",
              borderRadius: 999,
              padding: "12px 18px",
              fontSize: 14,
              fontWeight: 600,
              cursor: "grab",
              touchAction: "none",
              userSelect: "none",
            }}
          >
            <Spark /> Ask Luna
          </button>
        </>
      )}

      {open && (
        <>
          <div
            onClick={() => setOpen(false)}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 950 }}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Ask Luna"
            style={{
              position: "fixed",
              top: "12vh",
              left: "50%",
              transform: "translateX(-50%)",
              width: "min(640px, 94vw)",
              maxHeight: "76vh",
              background: "var(--surface)",
              border: "1px solid var(--border-strong)",
              borderRadius: 16,
              boxShadow: "var(--shadow-lg)",
              zIndex: 951,
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            {/* Input bar */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "16px 18px", borderBottom: "1px solid var(--border)" }}>
              <Spark color="var(--tg-accent-dark)" />
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") ask(q); }}
                placeholder={
                  history.length > 0
                    ? "Ask a follow-up, e.g. \"and just the VIPs?\"…"
                    : "Ask Luna anything about your customers and trips…"
                }
                style={{
                  flex: 1,
                  border: "none",
                  outline: "none",
                  background: "transparent",
                  fontSize: 15,
                  color: "var(--text)",
                }}
              />
              {loading && <span style={{ fontSize: 12, color: "var(--text-subtle)" }}>Thinking…</span>}
              {!loading && history.length > 0 && (
                <button
                  onClick={resetThread}
                  title="Start a fresh question (clears the follow-up context)"
                  style={{
                    background: "var(--bg-subtle)",
                    border: "1px solid var(--border)",
                    borderRadius: 6,
                    padding: "4px 10px",
                    fontSize: 11.5,
                    fontWeight: 500,
                    color: "var(--text-muted)",
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                  }}
                >
                  New question
                </button>
              )}
            </div>

            {/* Body */}
            <div style={{ overflowY: "auto", padding: 18 }}>
              {!answer && !loading && (
                <div>
                  <div style={{ fontSize: 12, color: "var(--text-subtle)", marginBottom: 10, fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase" }}>
                    Try asking
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {EXAMPLES.map((ex) => (
                      <button
                        key={ex}
                        onClick={() => { setQ(ex); ask(ex); }}
                        style={{
                          textAlign: "left",
                          background: "var(--bg-subtle)",
                          border: "1px solid var(--border)",
                          borderRadius: 8,
                          padding: "9px 12px",
                          fontSize: 13.5,
                          color: "var(--text-muted)",
                          cursor: "pointer",
                        }}
                      >
                        {ex}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {answer && <AnswerView answer={answer} onNavigate={() => setOpen(false)} />}
            </div>
          </div>
        </>
      )}
    </>
  );
}

function AnswerView({ answer, onNavigate }: { answer: AskResponse; onNavigate: () => void }) {
  if (!answer.ok) {
    return <div style={{ fontSize: 14, color: "var(--error)" }}>{answer.error}</div>;
  }

  const r = answer.result;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* The Luna insight layer — prominent, at the top */}
      {answer.insight && (
        <div
          style={{
            display: "flex",
            gap: 10,
            background: "linear-gradient(180deg, rgba(0,180,216,0.06), transparent)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            padding: "12px 14px",
          }}
        >
          <Spark color="var(--tg-accent-dark)" />
          <div style={{ fontSize: 14, color: "var(--text)", lineHeight: 1.5 }}>{answer.insight}</div>
        </div>
      )}

      {/* Number result */}
      {r?.shape === "number" && r.value && (
        <div style={{ textAlign: "center", padding: "12px 0" }}>
          <div style={{ fontSize: 40, fontWeight: 700, color: "var(--text)", letterSpacing: "-0.02em" }}>{r.value}</div>
          <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4 }}>{r.summary}</div>
        </div>
      )}

      {/* List result */}
      {r?.shape === "list" && r.rows && (
        <div>
          <div style={{ fontSize: 12, color: "var(--text-subtle)", marginBottom: 8 }}>{r.summary}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {r.rows.map((row) => (
              <a
                key={row.id}
                href={row.href}
                onClick={onNavigate}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 10,
                  background: "var(--bg-subtle)",
                  border: "1px solid var(--border)",
                  borderRadius: 9,
                  padding: "9px 12px",
                  textDecoration: "none",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--text)" }}>{row.title}</div>
                  {row.subtitle && (
                    <div style={{ fontSize: 12, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {row.subtitle}
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                  {(row.badges ?? []).map((b) => (
                    <span
                      key={b}
                      style={{
                        fontSize: 10,
                        padding: "2px 7px",
                        borderRadius: 5,
                        background: /vip|risk/i.test(b) ? "rgba(239,68,68,0.08)" : "var(--surface)",
                        color: /vip/i.test(b) ? "var(--error)" : /risk/i.test(b) ? "var(--warning)" : "var(--text-subtle)",
                        border: "1px solid var(--border)",
                        fontWeight: 600,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {b}
                    </span>
                  ))}
                </div>
              </a>
            ))}
          </div>
          {r.actionable && <AskActions rows={r.rows} />}
        </div>
      )}

      {/* Empty */}
      {r?.shape === "empty" && (
        <div style={{ fontSize: 13.5, color: "var(--text-muted)", textAlign: "center", padding: "8px 0" }}>{r.summary}</div>
      )}
    </div>
  );
}

// ─── The act layer ──────────────────────────────────────────────────────────
// When an answer is a list of customers, the agent can act on it right here:
// open a pre-addressed email to everyone, enrol them in a journey, or tag
// them. Reuses the same endpoints as the customers segment bar, so acting on
// an Ask answer and acting on a segment are the same operation.

const UUID_HREF = /^\/customers\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

function AskActions({ rows }: { rows: Row[] }) {
  const householdIds = Array.from(
    new Set(rows.map((r) => r.href?.match(UUID_HREF)?.[1]).filter((x): x is string => Boolean(x)))
  );

  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [journeys, setJourneys] = useState<{ id: string; name: string }[] | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [tagOpen, setTagOpen] = useState(false);
  const [tag, setTag] = useState("");

  if (householdIds.length === 0) return null;

  async function emailAll() {
    setMsg(null);
    setBusy("email");
    try {
      const res = await fetch("/api/customers/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: householdIds }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        emails?: string[];
        excluded_no_consent?: number;
        error?: string;
      };
      if (!res.ok || !data.ok) throw new Error(data.error || "Couldn't load emails");
      const emails = data.emails ?? [];
      const excluded = data.excluded_no_consent ?? 0;
      if (emails.length === 0) {
        setMsg({
          ok: false,
          text:
            excluded > 0
              ? `No email marketing consent on file for these customers (${excluded} excluded).`
              : "No email addresses on file for these customers.",
        });
        return;
      }
      const params = new URLSearchParams();
      params.set("bcc", emails.join(","));
      window.location.href = `mailto:?${params.toString()}`;
      setMsg({
        ok: true,
        text: `Opened a draft to ${emails.length} customer${emails.length > 1 ? "s" : ""}.${
          excluded > 0 ? ` ${excluded} excluded, no marketing consent.` : ""
        }`,
      });
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : "Couldn't load emails" });
    } finally {
      setBusy(null);
    }
  }

  async function openPicker() {
    setMsg(null);
    if (pickerOpen) {
      setPickerOpen(false);
      return;
    }
    setPickerOpen(true);
    setTagOpen(false);
    if (journeys === null) {
      try {
        const res = await fetch("/api/journeys/list");
        const data = (await res.json().catch(() => ({}))) as { ok?: boolean; journeys?: { id: string; name: string }[] };
        setJourneys(data.ok ? data.journeys ?? [] : []);
      } catch {
        setJourneys([]);
      }
    }
  }

  async function enroll(journeyId: string, name: string) {
    setBusy("journey");
    try {
      const res = await fetch("/api/journeys/enroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ journeyId, householdIds }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; enrolled?: number; skipped?: number; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error || "Couldn't add to journey");
      setPickerOpen(false);
      setMsg({
        ok: true,
        text: `Added ${data.enrolled ?? 0} to "${name}"${data.skipped ? ` (${data.skipped} already in it)` : ""}.`,
      });
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : "Couldn't add to journey" });
    } finally {
      setBusy(null);
    }
  }

  async function addTag() {
    const t = tag.trim();
    if (!t) return;
    setBusy("tag");
    try {
      const res = await fetch("/api/customers/tag", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: householdIds, tag: t }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; updated?: number; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error || "Couldn't add tag");
      setTagOpen(false);
      setTag("");
      setMsg({ ok: true, text: `Tagged ${data.updated ?? 0} customer${data.updated === 1 ? "" : "s"} "${t}".` });
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : "Couldn't add tag" });
    } finally {
      setBusy(null);
    }
  }

  const actBtn: React.CSSProperties = {
    background: "var(--bg-subtle)",
    border: "1px solid var(--border)",
    borderRadius: 7,
    padding: "6px 11px",
    fontSize: 12,
    fontWeight: 500,
    color: "var(--text-muted)",
    cursor: "pointer",
  };

  return (
    <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--border)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <span style={{ fontSize: 11, color: "var(--text-subtle)", marginRight: 2 }}>
          Act on {householdIds.length === 1 ? "this customer" : `these ${householdIds.length}`}:
        </span>
        <button style={actBtn} disabled={busy === "email"} onClick={emailAll}>
          {busy === "email" ? "Opening…" : "Email all"}
        </button>
        <button style={actBtn} onClick={openPicker}>
          Add to journey
        </button>
        <button style={actBtn} onClick={() => { setTagOpen((o) => !o); setPickerOpen(false); setMsg(null); }}>
          Add tag
        </button>
      </div>

      {pickerOpen && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8, alignItems: "center" }}>
          {journeys === null ? (
            <span style={{ fontSize: 12, color: "var(--text-subtle)" }}>Loading journeys…</span>
          ) : journeys.length === 0 ? (
            <span style={{ fontSize: 12, color: "var(--text-subtle)" }}>No active journeys. Install them on the Journeys page first.</span>
          ) : (
            journeys.map((j) => (
              <button key={j.id} style={actBtn} disabled={busy === "journey"} onClick={() => enroll(j.id, j.name)}>
                {j.name}
              </button>
            ))
          )}
        </div>
      )}

      {tagOpen && (
        <div style={{ display: "flex", gap: 6, marginTop: 8, alignItems: "center" }}>
          <input
            value={tag}
            onChange={(e) => setTag(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addTag()}
            placeholder="e.g. Winter sun campaign"
            autoFocus
            style={{
              flex: 1,
              maxWidth: 240,
              border: "1px solid var(--border)",
              borderRadius: 6,
              background: "var(--surface)",
              color: "var(--text)",
              padding: "6px 9px",
              fontSize: 12.5,
              fontFamily: "inherit",
            }}
          />
          <button style={{ ...actBtn, color: "var(--tg-accent-dark)", borderColor: "var(--tg-accent)" }} disabled={busy === "tag" || !tag.trim()} onClick={addTag}>
            {busy === "tag" ? "Tagging…" : "Tag"}
          </button>
        </div>
      )}

      {msg && (
        <div style={{ marginTop: 8, fontSize: 12, color: msg.ok ? "var(--success)" : "var(--error)" }}>{msg.text}</div>
      )}
    </div>
  );
}

function Spark({ color = "white" }: { color?: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }} aria-hidden="true">
      <path d="M12 3l1.9 5.6L19.5 10l-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.4L12 3z" fill={color} />
    </svg>
  );
}
