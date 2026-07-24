"use client";

/**
 * The natural-language journey builder card — mounted above the journeys
 * grid. Type the rule in a sentence; Luna translates it into the engine's
 * vocabulary; the review card shows the explanation, any caveats (things
 * asked for that couldn't be included), the trigger and action as the
 * engine understands them, and a live dry-run ("would fire for N customers
 * today"). Nothing activates until the human presses Activate.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SparklesIcon, ZapIcon } from "@/components/ui/icons";
import type { RawJourneySpec } from "@/lib/journeys/compose";

type Composed = {
  spec: RawJourneySpec;
  explanation: string;
  caveats: string | null;
  trigger_label: string;
  action_label: string;
  matches: { count: number; examples: string[] };
};

const EXAMPLES = [
  "When a quote over £5,000 hasn't been answered in 3 days, create a call task",
  "Draft a re-engagement email when a customer has been quiet for 18 months",
  "Two weeks before departure, create a task to upsell airport transfers",
];

export function ComposeJourney() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [building, setBuilding] = useState(false);
  const [activating, setActivating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [composed, setComposed] = useState<Composed | null>(null);
  const [activated, setActivated] = useState(false);

  async function build() {
    setError(null);
    setComposed(null);
    setActivated(false);
    setBuilding(true);
    try {
      const res = await fetch("/api/journeys/compose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = (await res.json().catch(() => ({}))) as Composed & {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !data.ok) throw new Error(data.error || `Failed (${res.status})`);
      setComposed(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't build that rule");
    } finally {
      setBuilding(false);
    }
  }

  async function activate() {
    if (!composed) return;
    setError(null);
    setActivating(true);
    try {
      const res = await fetch("/api/journeys/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spec: composed.spec }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error || `Failed (${res.status})`);
      setActivated(true);
      setComposed(null);
      setText("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't activate it");
    } finally {
      setActivating(false);
    }
  }

  const chip: React.CSSProperties = {
    fontSize: 11.5,
    color: "var(--text-muted)",
    background: "var(--bg-subtle)",
    border: "1px solid var(--border)",
    borderRadius: 6,
    padding: "3px 8px",
  };

  return (
    <section
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 14,
        padding: 18,
        margin: "20px 24px 0",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <SparklesIcon width={15} height={15} style={{ color: "var(--tg-accent-dark)" }} />
        <span style={{ fontSize: 13.5, fontWeight: 700, color: "var(--text)" }}>
          Describe a journey, Luna builds it
        </span>
        <span style={{ fontSize: 11, color: "var(--text-subtle)" }}>
          you review and approve before anything switches on
        </span>
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "flex-start", flexWrap: "wrap" }}>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={`e.g. "${EXAMPLES[0]}"`}
          rows={2}
          style={{
            flex: 1,
            minWidth: 280,
            border: "1px solid var(--border)",
            borderRadius: 8,
            background: "var(--bg-subtle)",
            color: "var(--text)",
            padding: "9px 12px",
            fontSize: 13,
            fontFamily: "inherit",
            resize: "vertical",
            lineHeight: 1.5,
          }}
        />
        <button
          onClick={build}
          disabled={building || text.trim().length < 15}
          style={{
            background: "var(--tg-accent-dark)",
            border: "none",
            borderRadius: 8,
            padding: "9px 16px",
            fontSize: 13,
            fontWeight: 600,
            color: "white",
            cursor: building || text.trim().length < 15 ? "default" : "pointer",
            opacity: building || text.trim().length < 15 ? 0.55 : 1,
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <SparklesIcon width={13} height={13} />
          {building ? "Building…" : "Build with Luna"}
        </button>
      </div>

      {!composed && !error && !activated && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
          {EXAMPLES.map((e) => (
            <button
              key={e}
              onClick={() => setText(e)}
              style={{ ...chip, cursor: "pointer" }}
            >
              {e}
            </button>
          ))}
        </div>
      )}

      {error && <div style={{ marginTop: 10, fontSize: 12.5, color: "var(--error)" }}>{error}</div>}
      {activated && (
        <div style={{ marginTop: 10, fontSize: 12.5, color: "var(--success, #059669)", fontWeight: 600 }}>
          Journey activated. It now appears below with the others, and runs with the next auto-pilot pass.
        </div>
      )}

      {composed && (
        <div
          style={{
            marginTop: 12,
            border: "1px solid var(--border)",
            borderRadius: 10,
            padding: 14,
            background: "var(--bg-subtle)",
          }}
        >
          <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--text)", marginBottom: 6 }}>
            {String(composed.spec.name ?? "New journey")}
          </div>
          <div style={{ fontSize: 12.5, color: "var(--text)", lineHeight: 1.55, marginBottom: 8 }}>
            {composed.explanation}
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
            <span style={chip}>
              <ZapIcon width={10} height={10} style={{ verticalAlign: -1 }} /> When: {composed.trigger_label}
            </span>
            <span style={chip}>Then: {composed.action_label}</span>
            <span
              style={{
                ...chip,
                color: composed.matches.count > 0 ? "var(--tg-accent-dark)" : "var(--text-subtle)",
                fontWeight: 600,
              }}
            >
              Would fire for {composed.matches.count} customer{composed.matches.count === 1 ? "" : "s"} today
            </span>
          </div>
          {composed.matches.examples.length > 0 && (
            <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginBottom: 8 }}>
              e.g. {composed.matches.examples.join(" · ")}
            </div>
          )}
          {composed.caveats && (
            <div
              style={{
                fontSize: 12,
                color: "#d97706",
                background: "rgba(217,119,6,0.08)",
                border: "1px solid rgba(217,119,6,0.25)",
                borderRadius: 8,
                padding: "7px 10px",
                marginBottom: 10,
                lineHeight: 1.5,
              }}
            >
              Left out: {composed.caveats}
            </div>
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={activate}
              disabled={activating}
              style={{
                background: "var(--tg-primary)",
                border: "none",
                borderRadius: 7,
                padding: "7px 15px",
                fontSize: 13,
                fontWeight: 600,
                color: "white",
                cursor: activating ? "default" : "pointer",
                opacity: activating ? 0.6 : 1,
              }}
            >
              {activating ? "Activating…" : "Looks right, activate it"}
            </button>
            <button
              onClick={() => setComposed(null)}
              style={{
                background: "transparent",
                border: "1px solid var(--border)",
                borderRadius: 7,
                padding: "7px 13px",
                fontSize: 13,
                color: "var(--text-muted)",
                cursor: "pointer",
              }}
            >
              Discard
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
