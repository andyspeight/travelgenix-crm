"use client";

/**
 * Sequences — the client half.
 *
 * The screen is built around the thing that matters: not "what did we send"
 * but "who are we still chasing, and why did the others stop". A list of
 * stopped chases with their reasons is what tells an agent the automation is
 * behaving — and it is the first thing they will look for after switching one
 * on.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ZapIcon, SendIcon, CheckIcon } from "@/components/ui/icons";

export type SequenceCard = {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  autoSend: boolean;
  steps: { stepNumber: number; delayDays: number; subject: string }[];
  active: number;
  stopped: number;
  completed: number;
};

export type EnrolmentRow = {
  id: string;
  sequenceName: string;
  household: string | null;
  householdId: string | null;
  status: "active" | "completed" | "stopped";
  stepsSent: number;
  totalSteps: number;
  stopReason: string | null;
  enrolledAt: string;
};

const dayLabel = (d: number) => (d === 0 ? "straight away" : `day ${d}`);

export function SequencesView({
  cards,
  enrolments,
  installed,
}: {
  cards: SequenceCard[];
  enrolments: EnrolmentRow[];
  installed: boolean;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function install() {
    setBusy("install");
    try {
      const res = await fetch("/api/sequences/install", { method: "POST" });
      if (res.ok) startTransition(() => router.refresh());
      else setNote("Could not install the starter sequence.");
    } finally {
      setBusy(null);
    }
  }

  async function patch(id: string, change: Record<string, boolean>) {
    setBusy(id);
    setNote(null);
    try {
      const res = await fetch(`/api/sequences/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(change),
      });
      if (res.ok) startTransition(() => router.refresh());
      else setNote("That change did not save.");
    } finally {
      setBusy(null);
    }
  }

  const stopped = enrolments.filter((e) => e.status === "stopped");
  const active = enrolments.filter((e) => e.status === "active");

  return (
    <div style={{ padding: "20px 28px", maxWidth: 1100, margin: "0 auto" }}>
      {note && (
        <div style={{ fontSize: 12.5, color: "#dc2626", marginBottom: 12 }}>{note}</div>
      )}

      {!installed && (
        <section style={panel}>
          <h2 style={h2}>Chase a quote without nagging</h2>
          <p style={p}>
            A sequence follows up over days and stops the moment it should — when they
            reply, when the quote is answered, or when the address turns out to be dead.
            The starter is a three-step quote chase. It installs paused and in review
            mode, so you can read the wording before anything goes out.
          </p>
          <button onClick={install} disabled={busy === "install"} style={primaryBtn}>
            <ZapIcon width={13} height={13} />
            {busy === "install" ? "Installing…" : "Install the quote chase"}
          </button>
        </section>
      )}

      {cards.map((c) => (
        <section key={c.id} style={panel}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 14, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 240 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 4 }}>
                <h2 style={{ ...h2, margin: 0 }}>{c.name}</h2>
                <StatePill on={c.isActive} onLabel="Running" offLabel="Paused" />
                {c.autoSend ? (
                  <StatePill on onLabel="Sends automatically" offLabel="" tone="warn" />
                ) : (
                  <StatePill on={false} onLabel="" offLabel="Drafts for review" />
                )}
              </div>
              {c.description && <p style={{ ...p, marginBottom: 10 }}>{c.description}</p>}

              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
                {c.steps.map((s) => (
                  <span key={s.stepNumber} style={chip}>
                    {dayLabel(s.delayDays)} · {s.subject}
                  </span>
                ))}
              </div>

              <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                {c.active} being chased · {c.stopped} stopped · {c.completed} ran to the end
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                onClick={() => patch(c.id, { is_active: !c.isActive })}
                disabled={busy === c.id}
                style={c.isActive ? secondaryBtn : primaryBtn}
              >
                {c.isActive ? "Pause" : "Turn on"}
              </button>
              <button
                onClick={() => patch(c.id, { auto_send: !c.autoSend })}
                disabled={busy === c.id}
                style={secondaryBtn}
                title={
                  c.autoSend
                    ? "Go back to queueing each step as a draft for you to review"
                    : "Let this sequence send to customers without you pressing anything"
                }
              >
                {c.autoSend ? "Switch to review mode" : "Let it send automatically"}
              </button>
            </div>
          </div>

          {!c.autoSend && (
            <p style={{ ...p, marginTop: 12, marginBottom: 0, fontSize: 12 }}>
              Each step arrives in your Tasks with the wording ready. Nothing reaches a
              customer until you send it.
            </p>
          )}
        </section>
      ))}

      {enrolments.length > 0 && (
        <section style={panel}>
          <h2 style={h2}>Who Luna is chasing</h2>
          {active.length === 0 && (
            <p style={p}>Nobody at the moment.</p>
          )}
          {active.map((e) => (
            <Row key={e.id} e={e} />
          ))}

          {stopped.length > 0 && (
            <>
              <h3 style={{ ...h2, fontSize: 13, marginTop: 18 }}>
                Stopped — and why
              </h3>
              <p style={{ ...p, marginBottom: 10 }}>
                This is the list worth reading. It is how you can tell the chase is
                behaving itself.
              </p>
              {stopped.slice(0, 12).map((e) => (
                <Row key={e.id} e={e} />
              ))}
            </>
          )}
        </section>
      )}
    </div>
  );
}

function Row({ e }: { e: EnrolmentRow }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 12,
        padding: "9px 0",
        borderBottom: "1px solid var(--border)",
      }}
    >
      <span
        aria-hidden
        style={{
          width: 7,
          height: 7,
          borderRadius: "50%",
          marginTop: 6,
          flexShrink: 0,
          background:
            e.status === "active"
              ? "var(--tg-accent-dark)"
              : e.status === "stopped"
                ? "var(--text-subtle)"
                : "var(--success)",
        }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, color: "var(--text)" }}>
          {e.householdId ? (
            <Link href={`/customers/${e.householdId}`} style={{ color: "inherit" }}>
              {e.household ?? "A customer"}
            </Link>
          ) : (
            e.household ?? "A customer"
          )}{" "}
          <span style={{ color: "var(--text-subtle)" }}>· {e.sequenceName}</span>
        </div>
        <div style={{ fontSize: 11.5, color: "var(--text-muted)", lineHeight: 1.5 }}>
          {e.stopReason
            ? e.stopReason
            : `Step ${e.stepsSent} of ${e.totalSteps} sent.`}
        </div>
      </div>
      <span style={{ fontSize: 11, color: "var(--text-subtle)", flexShrink: 0 }}>
        {e.stepsSent}/{e.totalSteps}
      </span>
    </div>
  );
}

function StatePill({
  on,
  onLabel,
  offLabel,
  tone,
}: {
  on: boolean;
  onLabel: string;
  offLabel: string;
  tone?: "warn";
}) {
  const label = on ? onLabel : offLabel;
  if (!label) return null;
  const colour = tone === "warn" ? "var(--warning)" : on ? "var(--success)" : "var(--text-subtle)";
  return (
    <span
      style={{
        fontSize: 10.5,
        fontWeight: 700,
        color: colour,
        border: `1px solid ${colour}`,
        borderRadius: 999,
        padding: "1px 8px",
      }}
    >
      {label}
    </span>
  );
}

const panel: React.CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: 14,
  padding: 20,
  boxShadow: "var(--shadow-sm)",
  marginBottom: 16,
};
const h2: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 700,
  margin: "0 0 6px",
  color: "var(--text)",
};
const p: React.CSSProperties = {
  fontSize: 13,
  color: "var(--text-muted)",
  lineHeight: 1.6,
  margin: "0 0 14px",
};
const chip: React.CSSProperties = {
  fontSize: 11.5,
  background: "var(--bg-subtle)",
  border: "1px solid var(--border)",
  borderRadius: 6,
  padding: "3px 9px",
  color: "var(--text-muted)",
};
const primaryBtn: React.CSSProperties = {
  background: "var(--tg-primary)",
  color: "white",
  border: "none",
  borderRadius: 7,
  padding: "8px 14px",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
};
const secondaryBtn: React.CSSProperties = {
  background: "var(--surface)",
  color: "var(--text)",
  border: "1px solid var(--border)",
  borderRadius: 7,
  padding: "8px 14px",
  fontSize: 13,
  fontWeight: 500,
  cursor: "pointer",
};
