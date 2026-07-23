"use client";

/**
 * Consent panel — per-channel marketing consent on the Customer 360.
 *
 * One row per adult contact, one chip per channel. Three states, all
 * visually distinct: granted (green), refused (red), not recorded (muted).
 * Clicking a chip opens a small inline recorder: grant or withdraw, with
 * the source and optionally the exact wording — because a consent without
 * evidence is barely a consent (blueprint §3).
 *
 * Children are deliberately not listed: we don't market to them.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  CONSENT_CHANNELS,
  CHANNEL_LABELS,
  type ConsentChannel,
  type ChannelState,
} from "@/lib/consent/state";

export type ConsentPanelContact = {
  id: string;
  name: string;
  role: string;
};

export type ConsentPanelProps = {
  contacts: ConsentPanelContact[];
  /** contactId -> channel -> state, precomputed server-side. */
  state: Record<string, Partial<Record<ConsentChannel, ChannelState>>>;
  /** True when the consents migration hasn't been run yet. */
  ledgerMissing: boolean;
};

const SOURCE_OPTIONS = [
  { value: "agent_recorded", label: "Recorded by agent" },
  { value: "verbal", label: "Verbal (call / in person)" },
  { value: "email_reply", label: "Email reply" },
  { value: "webform", label: "Web form" },
  { value: "preference_centre", label: "Preference centre" },
];

const CHIP_STYLE: Record<"granted" | "refused" | "unknown", { bg: string; fg: string; border: string }> = {
  granted: { bg: "rgba(5, 150, 105, 0.10)", fg: "#059669", border: "rgba(5,150,105,0.35)" },
  refused: { bg: "rgba(220, 38, 38, 0.08)", fg: "#dc2626", border: "rgba(220,38,38,0.3)" },
  unknown: { bg: "var(--bg-subtle)", fg: "var(--text-subtle)", border: "var(--border)" },
};

export function ConsentPanel({ contacts, state, ledgerMissing }: ConsentPanelProps) {
  const router = useRouter();
  const [editing, setEditing] = useState<{ contactId: string; channel: ConsentChannel } | null>(null);
  const [source, setSource] = useState("agent_recorded");
  const [wording, setWording] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function record(granted: boolean) {
    if (!editing) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/contacts/${editing.contactId}/consent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel: editing.channel,
          granted,
          source,
          wording: wording || null,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error || `Failed (${res.status})`);
      setEditing(null);
      setWording("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't record that");
    } finally {
      setBusy(false);
    }
  }

  const stateFor = (contactId: string, channel: ConsentChannel): ChannelState =>
    state[contactId]?.[channel] ?? { state: "unknown", occurred_at: null, source: null };

  return (
    <section
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 14,
        marginTop: 16,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "12px 16px",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>
          Marketing consent
        </span>
        <span style={{ fontSize: 10.5, color: "var(--text-subtle)" }}>
          per channel, with evidence
        </span>
      </div>

      <div style={{ padding: "12px 16px" }}>
        {ledgerMissing && (
          <div style={{ fontSize: 11.5, color: "var(--warning)", marginBottom: 10, lineHeight: 1.5 }}>
            Consent ledger not set up yet — run the consents migration in Supabase. Showing nothing
            rather than guessing.
          </div>
        )}

        {contacts.length === 0 && (
          <div style={{ fontSize: 12, color: "var(--text-subtle)" }}>No adult contacts on file.</div>
        )}

        {contacts.map((c) => (
          <div key={c.id} style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-muted)", marginBottom: 5 }}>
              {c.name}
              <span style={{ fontWeight: 400, color: "var(--text-subtle)" }}> · {c.role}</span>
            </div>
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
              {CONSENT_CHANNELS.map((channel) => {
                const s = stateFor(c.id, channel);
                const chip = CHIP_STYLE[s.state];
                const active = editing?.contactId === c.id && editing.channel === channel;
                return (
                  <button
                    key={channel}
                    onClick={() => {
                      setError(null);
                      setEditing(active ? null : { contactId: c.id, channel });
                      setWording("");
                    }}
                    disabled={ledgerMissing}
                    title={
                      s.state === "unknown"
                        ? `${CHANNEL_LABELS[channel]}: not recorded. Click to record.`
                        : `${CHANNEL_LABELS[channel]}: ${s.state}${s.occurred_at ? ` on ${new Date(s.occurred_at).toLocaleDateString("en-GB")}` : ""}${s.source ? ` (${s.source.replace(/_/g, " ")})` : ""}. Click to change.`
                    }
                    style={{
                      background: chip.bg,
                      color: chip.fg,
                      border: `1px solid ${active ? "var(--tg-primary)" : chip.border}`,
                      borderRadius: 6,
                      padding: "3px 8px",
                      fontSize: 10.5,
                      fontWeight: 600,
                      cursor: ledgerMissing ? "default" : "pointer",
                      opacity: ledgerMissing ? 0.5 : 1,
                    }}
                  >
                    {CHANNEL_LABELS[channel]}
                    {s.state === "granted" ? " ✓" : s.state === "refused" ? " ✕" : ""}
                  </button>
                );
              })}
            </div>

            {editing?.contactId === c.id && (
              <div
                style={{
                  marginTop: 8,
                  padding: 10,
                  background: "var(--bg-subtle)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                }}
              >
                <div style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text)", marginBottom: 6 }}>
                  Record {CHANNEL_LABELS[editing.channel]} consent for {c.name}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <select
                    value={source}
                    onChange={(e) => setSource(e.target.value)}
                    style={{
                      border: "1px solid var(--border)",
                      borderRadius: 6,
                      background: "var(--surface)",
                      color: "var(--text)",
                      padding: "5px 8px",
                      fontSize: 11.5,
                      fontFamily: "inherit",
                    }}
                  >
                    {SOURCE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                  <input
                    value={wording}
                    onChange={(e) => setWording(e.target.value)}
                    placeholder="Exact wording used (optional but worth keeping)"
                    style={{
                      border: "1px solid var(--border)",
                      borderRadius: 6,
                      background: "var(--surface)",
                      color: "var(--text)",
                      padding: "5px 8px",
                      fontSize: 11.5,
                      fontFamily: "inherit",
                    }}
                  />
                  {error && <div style={{ fontSize: 11, color: "var(--error)" }}>{error}</div>}
                  <div style={{ display: "flex", gap: 6 }}>
                    <button
                      onClick={() => record(true)}
                      disabled={busy}
                      style={{
                        flex: 1,
                        background: "rgba(5,150,105,0.12)",
                        color: "#059669",
                        border: "1px solid rgba(5,150,105,0.35)",
                        borderRadius: 6,
                        padding: "5px 0",
                        fontSize: 11.5,
                        fontWeight: 700,
                        cursor: "pointer",
                        opacity: busy ? 0.6 : 1,
                      }}
                    >
                      Opted in
                    </button>
                    <button
                      onClick={() => record(false)}
                      disabled={busy}
                      style={{
                        flex: 1,
                        background: "rgba(220,38,38,0.08)",
                        color: "#dc2626",
                        border: "1px solid rgba(220,38,38,0.3)",
                        borderRadius: 6,
                        padding: "5px 0",
                        fontSize: 11.5,
                        fontWeight: 700,
                        cursor: "pointer",
                        opacity: busy ? 0.6 : 1,
                      }}
                    >
                      Opted out
                    </button>
                    <button
                      onClick={() => setEditing(null)}
                      style={{
                        background: "transparent",
                        border: "1px solid var(--border)",
                        borderRadius: 6,
                        padding: "5px 10px",
                        fontSize: 11.5,
                        color: "var(--text-muted)",
                        cursor: "pointer",
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}

        <div style={{ fontSize: 10.5, color: "var(--text-subtle)", lineHeight: 1.5 }}>
          Bulk email actions only reach contacts with a current email grant. Operational messages
          (booking admin, service) are not gated. Every change is kept with its source and wording.
        </div>
      </div>
    </section>
  );
}
