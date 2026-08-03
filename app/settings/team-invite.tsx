"use client";

/**
 * Team invitations — the settings control.
 *
 * Invite a teammate by email and role. This does not grant access — Control's
 * sign-in does — and the copy says so plainly rather than implying a button
 * here is what lets someone in. What it does: records the decision so the whole
 * team can see who's been invited as what, and (when a mail provider is on)
 * emails them a sign-in link.
 *
 * Only an owner or admin sees the form; a member sees the list read-only.
 */

import { useEffect, useState } from "react";
import { INVITABLE_ROLES, inviteStatus, roleLabel, type InviteRole } from "@/lib/team/invite";

type Invitation = {
  id: string;
  email: string;
  role: string;
  status: string;
  invited_by_email: string | null;
  invited_at: string;
};

export function TeamInvite({
  memberEmails,
  canInvite,
  emailLive,
}: {
  memberEmails: string[];
  canInvite: boolean;
  emailLive: boolean;
}) {
  const [invites, setInvites] = useState<Invitation[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<InviteRole>("member");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function load() {
    try {
      const res = await fetch("/api/team/invitations");
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; invitations?: Invitation[] };
      if (data.ok) setInvites(data.invitations ?? []);
    } finally {
      setLoaded(true);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function invite() {
    setMsg(null);
    setBusy(true);
    try {
      const res = await fetch("/api/team/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        emailed?: boolean;
        emailConfigured?: boolean;
      };
      if (!res.ok || !data.ok) throw new Error(data.error || "Couldn't send that invite.");
      setEmail("");
      setRole("member");
      setMsg({
        ok: true,
        text: data.emailed
          ? "Invited — a sign-in link is on its way to them."
          : data.emailConfigured
            ? "Invited. The sign-in email didn't send — share the link with them directly."
            : "Invited and recorded. No mail provider is connected, so send them the sign-in link yourself.",
      });
      await load();
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : "Something went wrong." });
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    setMsg(null);
    try {
      const res = await fetch(`/api/team/invitations?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error || "Couldn't revoke that.");
      await load();
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : "Couldn't revoke that." });
    }
  }

  // Show pending/joined invites; a revoked one drops off the list.
  const visible = invites.filter((i) => inviteStatus(i, memberEmails) !== "revoked");

  const field: React.CSSProperties = {
    border: "1px solid var(--border)",
    borderRadius: 7,
    background: "var(--surface)",
    color: "var(--text)",
    padding: "7px 10px",
    fontSize: 13,
    fontFamily: "inherit",
  };

  return (
    <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--border)" }}>
      {canInvite ? (
        <>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text)", marginBottom: 8 }}>
            Invite a teammate
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && email.trim() && !busy) void invite(); }}
              placeholder="colleague@youragency.co.uk"
              style={{ ...field, flex: 1, minWidth: 220 }}
            />
            <select value={role} onChange={(e) => setRole(e.target.value as InviteRole)} style={field}>
              {INVITABLE_ROLES.map((r) => (
                <option key={r} value={r}>{roleLabel(r)}</option>
              ))}
            </select>
            <button
              onClick={() => void invite()}
              disabled={busy || !email.trim()}
              style={{
                background: "var(--tg-primary)",
                border: "1px solid var(--tg-primary)",
                color: "white",
                borderRadius: 7,
                padding: "7px 14px",
                fontSize: 13,
                fontWeight: 600,
                cursor: busy || !email.trim() ? "default" : "pointer",
                opacity: busy || !email.trim() ? 0.6 : 1,
              }}
            >
              {busy ? "Inviting…" : "Send invite"}
            </button>
          </div>
          <p style={{ fontSize: 11.5, color: "var(--text-subtle)", margin: "8px 0 0", lineHeight: 1.5 }}>
            Access is granted through Control, the Luna suite&apos;s shared sign-in — an invite
            records the role they should have and{" "}
            {emailLive ? "emails them a sign-in link." : "gives you a sign-in link to share (no mail provider is connected yet)."}{" "}
            The role applies when per-teammate roles go live; today everyone mapped to this
            workspace shares the same access.
          </p>
          {msg && (
            <p style={{ fontSize: 12, margin: "8px 0 0", color: msg.ok ? "var(--success)" : "var(--error)" }}>
              {msg.text}
            </p>
          )}
        </>
      ) : (
        <p style={{ fontSize: 12, color: "var(--text-subtle)", margin: 0, lineHeight: 1.5 }}>
          Only an owner or admin can invite teammates. Ask one of them to add someone to this
          workspace.
        </p>
      )}

      {visible.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-subtle)", letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: 6 }}>
            Invited
          </div>
          {visible.map((i) => {
            const state = inviteStatus(i, memberEmails);
            return (
              <div
                key={i.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "8px 0",
                  borderBottom: "1px solid var(--border)",
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: "var(--text)" }}>{i.email}</div>
                  <div style={{ fontSize: 11.5, color: "var(--text-subtle)" }}>
                    {roleLabel(i.role)} ·{" "}
                    {state === "joined" ? "On the team" : "Awaiting first sign-in"}
                  </div>
                </div>
                {state === "joined" ? (
                  <span style={{ fontSize: 11, fontWeight: 600, color: "var(--success)" }}>Joined</span>
                ) : (
                  <span style={{ fontSize: 11, fontWeight: 600, color: "var(--warning)" }}>Pending</span>
                )}
                {canInvite && state !== "joined" && (
                  <button
                    onClick={() => void revoke(i.id)}
                    style={{
                      background: "transparent",
                      border: "1px solid var(--border)",
                      color: "var(--text-muted)",
                      borderRadius: 6,
                      padding: "4px 9px",
                      fontSize: 11.5,
                      cursor: "pointer",
                    }}
                  >
                    Revoke
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
      {loaded && visible.length === 0 && !canInvite && (
        <p style={{ fontSize: 12, color: "var(--text-subtle)", marginTop: 10 }}>No pending invitations.</p>
      )}
    </div>
  );
}
