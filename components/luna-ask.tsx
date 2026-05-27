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
  "Who's travelling this weekend?",
  "Who is travelling to Greece?",
  "How much revenue did we book last month?",
];

export function LunaAsk() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [answer, setAnswer] = useState<AskResponse | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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
        body: JSON.stringify({ question }),
      });
      const data = (await res.json()) as AskResponse;
      setAnswer(data);
    } catch {
      setAnswer({ ok: false, question, error: "Something went wrong. Try again." });
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <>
      {/* Floating button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label="Ask Luna"
          style={{
            position: "fixed",
            bottom: 24,
            right: 24,
            zIndex: 900,
            display: "flex",
            alignItems: "center",
            gap: 9,
            background: "var(--tg-primary)",
            color: "white",
            border: "none",
            borderRadius: 999,
            padding: "12px 18px",
            fontSize: 14,
            fontWeight: 600,
            cursor: "pointer",
            boxShadow: "var(--shadow-lg)",
          }}
        >
          <Spark /> Ask Luna
        </button>
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
                placeholder="Ask Luna anything about your customers and trips…"
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
        </div>
      )}

      {/* Empty */}
      {r?.shape === "empty" && (
        <div style={{ fontSize: 13.5, color: "var(--text-muted)", textAlign: "center", padding: "8px 0" }}>{r.summary}</div>
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
