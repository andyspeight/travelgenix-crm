"use client";

/**
 * Journeys view — client component. Owns the interaction on /journeys:
 *   - Install starter journeys (empty state)
 *   - Run all active journeys, or one journey
 *   - Pause / activate a journey
 *
 * Every mutation posts to an /api/journeys route then calls router.refresh() so
 * the server recomputes eligibility and the run feed. Optimistic-free on
 * purpose: these actions write real rows (tasks, drafts), so we wait for the
 * server and show the true result rather than guessing.
 */

import { useState, useTransition, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ZapIcon, SparklesIcon, ClockIcon, CheckIcon, NoteIcon, SendIcon } from "@/components/ui/icons";
import type { JourneyFlow } from "@/lib/journeys/engine";
import { FlowStrip } from "./flow-strip";

export type JourneyCard = {
  id: string;
  name: string;
  description: string | null;
  triggerLabel: string;
  actionKind: string;
  actionLabel: string;
  flow: JourneyFlow;
  isActive: boolean;
  lastRunAt: string | null;
  eligibleNow: number;
};

export type RunFeedItem = {
  id: string;
  journeyName: string;
  household: string | null;
  householdId: string | null;
  email: string | null;
  summary: string;
  action: string;
  subject: string | null;
  body: string | null;
  status: string;
  firedAt: string;
};

export function JourneysView({
  cards,
  feed,
  activeCount,
  eligibleTotal,
  emailLive,
}: {
  cards: JourneyCard[];
  feed: RunFeedItem[];
  activeCount: number;
  eligibleTotal: number;
  emailLive: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const flash = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3600);
  }, []);

  const call = useCallback(
    async (key: string, url: string, init: RequestInit, onOk: (data: any) => string) => {
      setBusy(key);
      try {
        const res = await fetch(url, init);
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.ok) {
          flash(data.error || "Something went wrong. Try again.");
          return;
        }
        flash(onOk(data));
        startTransition(() => router.refresh());
      } catch {
        flash("Network error. Try again.");
      } finally {
        setBusy(null);
      }
    },
    [flash, router]
  );

  const install = () =>
    call("install", "/api/journeys/install", { method: "POST" }, (d) =>
      d.installed > 0 ? `Installed ${d.installed} starter journeys.` : "Journeys ready."
    );

  const runAll = () =>
    call("all", "/api/journeys/run", { method: "POST" }, (d) =>
      d.totalFired > 0
        ? `Luna handled ${d.totalFired} ${d.totalFired === 1 ? "thing" : "things"}.`
        : "Nothing new to do right now. All caught up."
    );

  const runOne = (id: string, name: string) =>
    call(
      id,
      "/api/journeys/run",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ journeyId: id }),
      },
      (d) =>
        d.totalFired > 0
          ? `${name}: ${d.totalFired} ${d.totalFired === 1 ? "action" : "actions"} taken.`
          : `${name}: nothing eligible right now.`
    );

  const toggle = (id: string, name: string, next: boolean) =>
    call(
      `t-${id}`,
      `/api/journeys/${id}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ is_active: next }),
      },
      () => `${name} ${next ? "activated" : "paused"}.`
    );

  // ─── Empty state ──────────────────────────────────────────────────────
  if (cards.length === 0) {
    return (
      <Shell>
        <Intro />
        <div
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 14,
            padding: 36,
            textAlign: "center",
            boxShadow: "var(--shadow-sm)",
          }}
        >
          <IconBubble />
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 6px" }}>
            Put Luna on auto-pilot
          </h2>
          <p
            style={{
              fontSize: 13.5,
              color: "var(--text-muted)",
              margin: "0 auto 20px",
              maxWidth: 460,
              lineHeight: 1.55,
            }}
          >
            Install four starter journeys: pre-departure check-ins, welcome-home
            emails, passport-expiry warnings and re-engaging quiet customers. You
            can pause any of them and you stay in control. Nothing sends without
            your say-so.
          </p>
          <PrimaryButton onClick={install} busy={busy === "install"}>
            Install starter journeys
          </PrimaryButton>
        </div>
        {toast ? <Toast text={toast} /> : null}
      </Shell>
    );
  }

  const dim = pending ? 0.6 : 1;

  return (
    <Shell>
      <Intro />

      {/* Summary bar */}
      <div
        style={{
          background:
            "linear-gradient(135deg, var(--tg-primary) 0%, var(--tg-primary-dark) 100%)",
          borderRadius: 14,
          padding: "18px 22px",
          color: "white",
          position: "relative",
          overflow: "hidden",
          display: "flex",
          alignItems: "center",
          gap: 18,
          boxShadow: "0 20px 40px -24px rgba(27, 43, 91, 0.45)",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: "-70%",
            right: "-4%",
            width: 320,
            height: 320,
            background: "radial-gradient(circle, var(--tg-accent) 0%, transparent 70%)",
            opacity: 0.2,
            pointerEvents: "none",
          }}
        />
        <div style={{ position: "relative" }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--tg-accent-light)" }}>
            {activeCount} active {activeCount === 1 ? "journey" : "journeys"}
          </div>
          <div style={{ fontSize: 13, opacity: 0.85, marginTop: 2 }}>
            {eligibleTotal > 0
              ? `${eligibleTotal} ${eligibleTotal === 1 ? "customer is" : "customers are"} eligible right now`
              : "Nothing eligible right now"}
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <button
          onClick={runAll}
          disabled={busy === "all" || eligibleTotal === 0}
          style={{
            position: "relative",
            background: eligibleTotal === 0 ? "rgba(255,255,255,0.15)" : "white",
            color: eligibleTotal === 0 ? "rgba(255,255,255,0.7)" : "var(--tg-primary)",
            border: "none",
            borderRadius: 8,
            padding: "9px 16px",
            fontSize: 13,
            fontWeight: 600,
            display: "inline-flex",
            alignItems: "center",
            gap: 7,
            cursor: eligibleTotal === 0 ? "default" : "pointer",
            opacity: busy === "all" ? 0.7 : 1,
          }}
        >
          <ZapIcon width={14} height={14} />
          {busy === "all" ? "Running…" : "Run all active"}
        </button>
      </div>

      {/* Two columns: journeys + activity */}
      <div
        className="rgrid rgrid-journeys"
        style={{
          gap: 18,
          marginTop: 18,
          alignItems: "start",
          opacity: dim,
          transition: "opacity 0.15s ease",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {cards.map((c) => (
            <JourneyRow
              key={c.id}
              card={c}
              busy={busy === c.id}
              toggling={busy === `t-${c.id}`}
              onRun={() => runOne(c.id, c.name)}
              onToggle={() => toggle(c.id, c.name, !c.isActive)}
            />
          ))}
        </div>

        <ActivityPanel feed={feed} emailLive={emailLive} />
      </div>

      {toast ? <Toast text={toast} /> : null}
    </Shell>
  );
}

// ─── Journey card ───────────────────────────────────────────────────────────

function JourneyRow({
  card,
  busy,
  toggling,
  onRun,
  onToggle,
}: {
  card: JourneyCard;
  busy: boolean;
  toggling: boolean;
  onRun: () => void;
  onToggle: () => void;
}) {
  return (
    <section
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 14,
        padding: 18,
        boxShadow: "var(--shadow-sm)",
        opacity: card.isActive ? 1 : 0.7,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 5 }}>
            <h3 style={{ fontSize: 14.5, fontWeight: 600, margin: 0, color: "var(--text)" }}>
              {card.name}
            </h3>
            {card.isActive ? (
              <span
                style={{
                  fontSize: 10.5,
                  fontWeight: 600,
                  color: "var(--success)",
                  background: "rgba(16,185,129,0.1)",
                  padding: "2px 8px",
                  borderRadius: 999,
                }}
              >
                Active
              </span>
            ) : (
              <span
                style={{
                  fontSize: 10.5,
                  fontWeight: 600,
                  color: "var(--text-subtle)",
                  background: "var(--bg-subtle)",
                  padding: "2px 8px",
                  borderRadius: 999,
                }}
              >
                Paused
              </span>
            )}
          </div>
          <p
            style={{
              fontSize: 12.5,
              color: "var(--text-muted)",
              margin: "0 0 12px",
              lineHeight: 1.5,
            }}
          >
            {card.description}
          </p>
          <FlowStrip flow={card.flow} compact />
        </div>

        {/* Pause / activate */}
        <button
          onClick={onToggle}
          disabled={toggling}
          title={card.isActive ? "Pause journey" : "Activate journey"}
          style={{
            background: "transparent",
            border: "1px solid var(--border)",
            borderRadius: 6,
            padding: "5px 10px",
            fontSize: 12,
            fontWeight: 500,
            color: "var(--text-muted)",
            whiteSpace: "nowrap",
            opacity: toggling ? 0.6 : 1,
          }}
        >
          {card.isActive ? "Pause" : "Activate"}
        </button>
      </div>

      {/* Footer: eligibility + run */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          marginTop: 14,
          paddingTop: 14,
          borderTop: "1px solid var(--border)",
        }}
      >
        <span style={{ fontSize: 12.5, color: "var(--text-muted)" }}>
          {card.isActive ? (
            <>
              <strong style={{ color: "var(--text)", fontWeight: 600 }}>
                {card.eligibleNow}
              </strong>{" "}
              eligible now
            </>
          ) : (
            "Paused — not evaluated"
          )}
        </span>
        <span style={{ fontSize: 11.5, color: "var(--text-subtle)" }}>
          {card.lastRunAt ? `Last run ${relativeTime(card.lastRunAt)}` : "Never run"}
        </span>
        <div style={{ flex: 1 }} />
        <button
          onClick={onRun}
          disabled={busy || !card.isActive || card.eligibleNow === 0}
          style={{
            background:
              !card.isActive || card.eligibleNow === 0
                ? "var(--bg-subtle)"
                : "var(--tg-primary)",
            color:
              !card.isActive || card.eligibleNow === 0 ? "var(--text-subtle)" : "white",
            border: "none",
            borderRadius: 6,
            padding: "6px 13px",
            fontSize: 12.5,
            fontWeight: 600,
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            cursor:
              !card.isActive || card.eligibleNow === 0 ? "default" : "pointer",
            opacity: busy ? 0.7 : 1,
          }}
        >
          <ZapIcon width={12} height={12} />
          {busy ? "Running…" : "Run now"}
        </button>
      </div>
    </section>
  );
}

// ─── Activity feed ──────────────────────────────────────────────────────────

function ActivityPanel({ feed, emailLive }: { feed: RunFeedItem[]; emailLive: boolean }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [openId, setOpenId] = useState<string | null>(null);
  const [resolving, setResolving] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);

  async function resolve(id: string, status: "sent" | "skipped") {
    setResolving(id);
    try {
      const res = await fetch(`/api/journeys/runs/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        setOpenId(null);
        startTransition(() => router.refresh());
      }
    } finally {
      setResolving(null);
    }
  }

  function openInEmail(f: RunFeedItem) {
    if (!f.email || !f.body) return;
    const params = new URLSearchParams();
    if (f.subject) params.set("subject", f.subject);
    params.set("body", f.body);
    window.location.href = `mailto:${f.email}?${params.toString()}`;
  }

  // Real send of a reviewed journey draft: the agent has seen the draft and
  // pressed the button — Luna drafted, a human dispatched.
  async function sendNow(f: RunFeedItem) {
    if (!f.email || !f.body) return;
    setResolving(f.id);
    setSendError(null);
    try {
      const res = await fetch("/api/email/send", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          to_email: f.email,
          household_id: f.householdId ?? undefined,
          subject: f.subject ?? f.journeyName,
          body: f.body,
          purpose: "operational",
          context: "journey",
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        not_configured?: boolean;
      };
      if (data.ok) {
        await resolve(f.id, "sent");
      } else if (data.not_configured) {
        openInEmail(f);
      } else {
        setSendError(data.error || "The send failed. Nothing was delivered.");
        setResolving(null);
      }
    } catch {
      setSendError("Network error — the send did not go through.");
      setResolving(null);
    }
  }

  const smallBtn: React.CSSProperties = {
    background: "transparent",
    border: "1px solid var(--border)",
    borderRadius: 5,
    padding: "3px 9px",
    fontSize: 11,
    fontWeight: 500,
    color: "var(--text-muted)",
    cursor: "pointer",
  };

  return (
    <section
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 14,
        padding: 18,
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <h2
        style={{
          fontSize: 13,
          fontWeight: 600,
          margin: "0 0 4px",
          display: "inline-flex",
          alignItems: "center",
          gap: 7,
        }}
      >
        <SparklesIcon width={13} height={13} style={{ color: "var(--tg-accent-dark)" }} />
        What Luna has done
      </h2>
      <p style={{ fontSize: 11.5, color: "var(--text-subtle)", margin: "0 0 14px" }}>
        Every action is logged. Drafts wait for your review before anything sends.
      </p>

      {feed.length === 0 ? (
        <p style={{ fontSize: 12.5, color: "var(--text-subtle)", margin: "4px 2px" }}>
          No activity yet. Run a journey to see Luna get to work.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {feed.map((f) => {
            const queued = f.status === "queued";
            const isDraft = f.action === "draft_email" && f.body;
            const expanded = openId === f.id;
            return (
              <div key={f.id} style={{ padding: "9px 4px", borderBottom: "1px solid var(--border)" }}>
                <div style={{ display: "flex", gap: 10 }}>
                  <RunIcon action={f.action} status={f.status} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, color: "var(--text)", lineHeight: 1.45 }}>
                      {f.summary}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-subtle)", marginTop: 1 }}>
                      {f.journeyName}
                      {" · "}
                      {relativeTime(f.firedAt)}
                      {queued ? (
                        <span style={{ color: "var(--warning)" }}> · awaiting review</span>
                      ) : f.status === "skipped" ? (
                        <span> · skipped</span>
                      ) : null}
                    </div>
                    {queued && sendError && resolving === null && openId === f.id && (
                      <div style={{ fontSize: 11, color: "#dc2626", marginTop: 5 }}>{sendError}</div>
                    )}
                    {queued && (
                      <div style={{ display: "flex", gap: 5, marginTop: 6, flexWrap: "wrap" }}>
                        {isDraft && (
                          <button style={smallBtn} onClick={() => setOpenId(expanded ? null : f.id)}>
                            {expanded ? "Hide draft" : "Review draft"}
                          </button>
                        )}
                        {isDraft && f.email && (
                          <button
                            style={{ ...smallBtn, color: "var(--tg-accent-dark)", borderColor: "var(--tg-accent)" }}
                            disabled={resolving === f.id}
                            onClick={() => (emailLive ? void sendNow(f) : openInEmail(f))}
                            title={
                              emailLive
                                ? `Sends this draft for real to ${f.email} and records it on the timeline`
                                : `Opens your email app addressed to ${f.email}`
                            }
                          >
                            {emailLive
                              ? resolving === f.id
                                ? "Sending…"
                                : "Send now"
                              : "Open in email"}
                          </button>
                        )}
                        <button
                          style={{ ...smallBtn, color: "var(--success)" }}
                          disabled={resolving === f.id}
                          onClick={() => resolve(f.id, "sent")}
                        >
                          {resolving === f.id ? "…" : "Mark done"}
                        </button>
                        <button
                          style={smallBtn}
                          disabled={resolving === f.id}
                          onClick={() => resolve(f.id, "skipped")}
                        >
                          Skip
                        </button>
                      </div>
                    )}
                    {expanded && isDraft && (
                      <div
                        style={{
                          marginTop: 8,
                          padding: "9px 11px",
                          background: "var(--bg-subtle)",
                          border: "1px solid var(--border)",
                          borderRadius: 8,
                          fontSize: 11.5,
                          lineHeight: 1.55,
                          whiteSpace: "pre-wrap",
                          color: "var(--text)",
                        }}
                      >
                        {f.subject ? <div style={{ fontWeight: 600, marginBottom: 6 }}>{f.subject}</div> : null}
                        {f.body}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function RunIcon({ action, status }: { action: string; status: string }) {
  const color =
    status === "sent" ? "var(--success)" : action === "draft_email" ? "var(--info)" : "var(--warning)";
  const Icon = action === "draft_email" ? SendIcon : action === "add_note" ? NoteIcon : CheckIcon;
  return (
    <span
      style={{
        width: 24,
        height: 24,
        borderRadius: 7,
        background: "var(--bg-subtle)",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        color,
        flexShrink: 0,
        marginTop: 1,
      }}
    >
      <Icon width={12} height={12} />
    </span>
  );
}

// ─── Shared bits ────────────────────────────────────────────────────────────

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ padding: 28, maxWidth: 1200, margin: "0 auto", width: "100%" }}>
      {children}
    </div>
  );
}

function Intro() {
  return (
    <div style={{ marginBottom: 18 }}>
      <h1
        style={{
          fontSize: 24,
          fontWeight: 700,
          letterSpacing: "-0.02em",
          margin: "0 0 4px",
          color: "var(--text)",
        }}
      >
        Journeys
      </h1>
      <p style={{ fontSize: 14, color: "var(--text-muted)", margin: 0, maxWidth: 640 }}>
        Auto-pilot rules that watch your customers and do the follow-ups nobody
        has time for. Luna drafts and queues, you stay in control.
      </p>
    </div>
  );
}

function Pill({ icon, text, accent }: { icon: React.ReactNode; text: string; accent?: boolean }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontSize: 11.5,
        fontWeight: 500,
        padding: "4px 10px",
        borderRadius: 999,
        background: accent ? "rgba(0,180,216,0.08)" : "var(--bg-subtle)",
        border: "1px solid var(--border)",
        color: accent ? "var(--tg-accent-dark)" : "var(--text-muted)",
      }}
    >
      {icon}
      {text}
    </span>
  );
}

function PrimaryButton({
  onClick,
  busy,
  children,
}: {
  onClick: () => void;
  busy: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      style={{
        background: "var(--tg-primary)",
        color: "white",
        border: "none",
        borderRadius: 8,
        padding: "10px 18px",
        fontSize: 13.5,
        fontWeight: 600,
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        opacity: busy ? 0.7 : 1,
      }}
    >
      <ZapIcon width={15} height={15} />
      {busy ? "Installing…" : children}
    </button>
  );
}

function IconBubble() {
  return (
    <div
      style={{
        width: 48,
        height: 48,
        borderRadius: 12,
        background: "linear-gradient(135deg, var(--tg-primary) 0%, var(--tg-accent) 100%)",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        color: "white",
        marginBottom: 16,
      }}
    >
      <ZapIcon width={22} height={22} />
    </div>
  );
}

function Toast({ text }: { text: string }) {
  return (
    <div
      style={{
        position: "fixed",
        bottom: 24,
        left: "50%",
        transform: "translateX(-50%)",
        background: "var(--tg-primary)",
        color: "white",
        padding: "11px 18px",
        borderRadius: 9,
        fontSize: 13,
        fontWeight: 500,
        boxShadow: "var(--shadow-lg)",
        zIndex: 50,
        animation: "fadeUp 0.25s ease-out",
      }}
    >
      {text}
    </div>
  );
}

function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
