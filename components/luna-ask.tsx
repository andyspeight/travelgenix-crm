"use client";

/**
 * Luna Ask — floating assistant. A button bottom-right opens a command bar.
 * Ask a plain-English question, get back the three layers:
 *   1. Luna insight (the "so what", shown prominently at the top)
 *   2. the structured output (list / number)
 *   3. clickable rows through to records
 *
 * Invocation: the floating button, Cmd/Ctrl+K, and anywhere in the app that
 * calls ask() from luna-ask-context — which is how the dashboard's prompt
 * line opens THIS panel rather than growing a second assistant with its own
 * history and its own quirks.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import type { AskRequest } from "@/components/luna-ask-context";

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

export function LunaAsk({ request }: { request?: AskRequest | null } = {}) {
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

  // Opened from somewhere else in the app — the dashboard prompt line, say.
  // An empty question just opens the panel; a real one is asked straight away,
  // because the agent already typed it and retyping is the whole friction we
  // were removing.
  useEffect(() => {
    if (!request) return;
    setOpen(true);
    if (request.question.trim()) {
      setQ(request.question);
      void ask(request.question);
    }
    // Keyed on the nonce so asking the same thing twice works.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request?.nonce]);

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
// Luna answers, and then does. When the answer is a list of customers the
// agent can act on it here rather than opening eleven records by hand.
//
// EVERY WRITE IS AGREED FIRST. Pressing a button produces a PLAN — the verb,
// the count, and the names — and nothing is written until the agent confirms
// it. "Luna did something to 40 customers" should never be a discovery, and
// the confirmation names them so it cannot be.
//
// Nothing here sends a message. Tasks, tags and sequence enrolments all land
// in a queue a human works; "Email all" opens a draft in the agent's own mail
// app and sends nothing by itself.

const UUID_HREF = /^\/customers\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

type ActPlan = {
  action: string;
  summary: string;
  who: string;
  notes: string[];
  targets: { id: string; name: string }[];
};

function AskActions({ rows }: { rows: Row[] }) {
  const householdIds = Array.from(
    new Set(rows.map((r) => r.href?.match(UUID_HREF)?.[1]).filter((x): x is string => Boolean(x)))
  );

  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Which composer is open: the task title, the tag, the sequence picker.
  const [panel, setPanel] = useState<"task" | "tag" | "sequence" | "journey" | null>(null);
  const [text, setText] = useState("");
  const [sequences, setSequences] = useState<{ id: string; name: string; auto_send: boolean }[] | null>(null);
  const [journeys, setJourneys] = useState<{ id: string; name: string }[] | null>(null);

  // The agreed-to-yet plan. Nothing has been written while this is on screen.
  const [plan, setPlan] = useState<{ action: string; value: string; plan: ActPlan } | null>(null);

  if (householdIds.length === 0) return null;

  const reset = () => {
    setPanel(null);
    setPlan(null);
    setText("");
  };

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

  /** Ask the server what WOULD happen. Writes nothing. */
  async function propose(action: string, value: string) {
    setMsg(null);
    setBusy(action);
    try {
      const res = await fetch("/api/ask/act", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, targetIds: householdIds, value }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; plan?: ActPlan; error?: string };
      if (!data.ok || !data.plan) throw new Error(data.error || "Luna couldn't work that out.");
      setPlan({ action, value, plan: data.plan });
      setPanel(null);
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : "Something went wrong." });
    } finally {
      setBusy(null);
    }
  }

  /** The same request again, with permission this time. */
  async function confirm() {
    if (!plan) return;
    setBusy("confirm");

    // Journeys keep their own endpoint — one implementation of what a journey
    // does, not two.
    if (plan.action.startsWith("journey:")) {
      try {
        const res = await fetch("/api/journeys/enroll", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ journeyId: plan.action.slice("journey:".length), householdIds }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          enrolled?: number;
          skipped?: number;
          error?: string;
        };
        if (!res.ok || !data.ok) throw new Error(data.error || "Couldn't run that journey");
        setMsg({
          ok: true,
          text: `Ran "${plan.value}" for ${data.enrolled ?? 0}${data.skipped ? ` (${data.skipped} already in it)` : ""}.`,
        });
        reset();
      } catch (err) {
        setMsg({ ok: false, text: err instanceof Error ? err.message : "Couldn't run that journey" });
      } finally {
        setBusy(null);
      }
      return;
    }

    try {
      const res = await fetch("/api/ask/act", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: plan.action,
          targetIds: plan.plan.targets.map((t) => t.id),
          value: plan.value,
          confirm: true,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        outcome?: { summary: string };
        error?: string;
      };
      if (!data.ok || !data.outcome) throw new Error(data.error || "That didn't finish.");
      setMsg({ ok: true, text: data.outcome.summary });
      reset();
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : "That didn't finish." });
    } finally {
      setBusy(null);
    }
  }

  /** Journeys run through their own endpoint, but agree the work first. */
  function proposeJourney(journeyId: string, name: string) {
    const count = householdIds.length;
    setPanel(null);
    setPlan({
      action: `journey:${journeyId}`,
      value: name,
      plan: {
        action: "run_journey",
        summary: `Run "${name}" for ${count} customer${count === 1 ? "" : "s"}`,
        who: rows
          .slice(0, 3)
          .map((r) => r.title)
          .join(", ") + (count > 3 ? ` and ${count - 3} more` : ""),
        notes: [
          "A journey creates the tasks and drafts it is set up to create. Nothing is sent to anyone.",
        ],
        targets: householdIds.map((id) => ({ id, name: "" })),
      },
    });
  }

  async function openJourneys() {
    setMsg(null);
    setPlan(null);
    setPanel(panel === "journey" ? null : "journey");
    if (journeys === null) {
      try {
        const res = await fetch("/api/journeys/list");
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          journeys?: { id: string; name: string }[];
        };
        setJourneys(data.ok ? data.journeys ?? [] : []);
      } catch {
        setJourneys([]);
      }
    }
  }

  async function openSequences() {
    setMsg(null);
    setPlan(null);
    setPanel(panel === "sequence" ? null : "sequence");
    if (sequences === null) {
      try {
        const res = await fetch("/api/ask/act");
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          sequences?: { id: string; name: string; auto_send: boolean }[];
        };
        setSequences(data.ok ? data.sequences ?? [] : []);
      } catch {
        setSequences([]);
      }
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

  const field: React.CSSProperties = {
    flex: 1,
    maxWidth: 260,
    border: "1px solid var(--border)",
    borderRadius: 6,
    background: "var(--surface)",
    color: "var(--text)",
    padding: "6px 9px",
    fontSize: 12.5,
    fontFamily: "inherit",
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
        <button
          style={actBtn}
          onClick={() => { setPlan(null); setMsg(null); setPanel(panel === "task" ? null : "task"); setText(""); }}
        >
          Create a task
        </button>
        <button
          style={actBtn}
          onClick={() => { setPlan(null); setMsg(null); setPanel(panel === "tag" ? null : "tag"); setText(""); }}
        >
          Add tag
        </button>
        <button style={actBtn} onClick={openSequences}>
          Add to sequence
        </button>
        <button style={actBtn} onClick={openJourneys}>
          Run a journey
        </button>
      </div>

      {/* ─── What are we calling it? ─────────────────────────── */}
      {(panel === "task" || panel === "tag") && (
        <div style={{ display: "flex", gap: 6, marginTop: 8, alignItems: "center" }}>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && text.trim()) {
                void propose(panel === "task" ? "create_task" : "add_tag", text);
              }
            }}
            placeholder={panel === "task" ? "Call about next summer" : "winter-sun"}
            autoFocus
            style={field}
          />
          <button
            style={{ ...actBtn, color: "var(--tg-accent-dark)", borderColor: "var(--tg-accent)" }}
            disabled={!text.trim() || Boolean(busy)}
            onClick={() => void propose(panel === "task" ? "create_task" : "add_tag", text)}
          >
            Next
          </button>
        </div>
      )}

      {panel === "sequence" && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8, alignItems: "center" }}>
          {sequences === null ? (
            <span style={{ fontSize: 12, color: "var(--text-subtle)" }}>Loading sequences…</span>
          ) : sequences.length === 0 ? (
            <span style={{ fontSize: 12, color: "var(--text-subtle)" }}>
              No active sequences. Set one up on the Sequences page first.
            </span>
          ) : (
            sequences.map((seq) => (
              <button
                key={seq.id}
                style={actBtn}
                disabled={Boolean(busy)}
                onClick={() => void propose("enrol_sequence", seq.id)}
              >
                {seq.name}
                {seq.auto_send && (
                  <span style={{ color: "var(--tg-accent-dark)", marginLeft: 5 }}>· auto-sends</span>
                )}
              </button>
            ))
          )}
        </div>
      )}

      {panel === "journey" && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8, alignItems: "center" }}>
          {journeys === null ? (
            <span style={{ fontSize: 12, color: "var(--text-subtle)" }}>Loading journeys…</span>
          ) : journeys.length === 0 ? (
            <span style={{ fontSize: 12, color: "var(--text-subtle)" }}>
              No active journeys. Install them on the Journeys page first.
            </span>
          ) : (
            journeys.map((j) => (
              <button key={j.id} style={actBtn} onClick={() => proposeJourney(j.id, j.name)}>
                {j.name}
              </button>
            ))
          )}
        </div>
      )}

      {/* ─── The plan, before anything happens ───────────────── */}
      {plan && (
        <div
          style={{
            marginTop: 10,
            border: "1px solid var(--border)",
            borderRadius: 10,
            padding: "10px 12px",
            background: "var(--bg-subtle)",
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>{plan.plan.summary}</div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 3 }}>{plan.plan.who}</div>
          {plan.plan.notes.map((note) => (
            <div key={note} style={{ fontSize: 11.5, color: "var(--text-subtle)", marginTop: 4, lineHeight: 1.5 }}>
              {note}
            </div>
          ))}
          <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
            <button
              style={{
                ...actBtn,
                background: "var(--tg-primary)",
                borderColor: "var(--tg-primary)",
                color: "white",
                fontWeight: 600,
              }}
              disabled={busy === "confirm"}
              onClick={() => void confirm()}
            >
              {busy === "confirm" ? "Doing it…" : "Do it"}
            </button>
            <button style={{ ...actBtn, border: "none" }} onClick={reset}>
              Cancel
            </button>
          </div>
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
