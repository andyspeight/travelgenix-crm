"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * The passport number: the one field in the CRM that is encrypted at rest and
 * whose every access is recorded.
 *
 * Closed by default. It says only whether a number is on file; showing it is a
 * deliberate act that writes an audit row before the value is returned. The
 * revealed value auto-hides after a minute so it does not sit on a screen at
 * an unattended desk, and it is never put in the URL or a GET request.
 */

/** How long a revealed number stays on screen. */
const HIDE_AFTER_MS = 60_000;

export function PassportField({
  contactId,
  onFile: initialOnFile,
}: {
  contactId: string;
  onFile: boolean;
}) {
  const router = useRouter();
  const [onFile, setOnFile] = useState(initialOnFile);
  const [revealed, setRevealed] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Never leave a passport number on screen indefinitely.
  useEffect(() => {
    if (revealed === null) return;
    const t = setTimeout(() => setRevealed(null), HIDE_AFTER_MS);
    return () => clearTimeout(t);
  }, [revealed]);

  async function call(method: "PUT" | "POST" | "DELETE", body?: object) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/contacts/${contactId}/passport`, {
        method,
        ...(body ? { headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {}),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        passport_number?: string;
      };
      if (!res.ok || !data.ok) {
        setError(data.error || "That didn't work.");
        return null;
      }
      return data;
    } catch {
      setError("Couldn't reach the server.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function reveal() {
    const data = await call("POST");
    if (data?.passport_number) setRevealed(data.passport_number);
  }

  async function save() {
    const data = await call("PUT", { passport_number: draft });
    if (data) {
      setOnFile(true);
      setEditing(false);
      setDraft("");
      setRevealed(null);
      router.refresh();
    }
  }

  async function remove() {
    const data = await call("DELETE");
    if (data) {
      setOnFile(false);
      setRevealed(null);
      router.refresh();
    }
  }

  const link: React.CSSProperties = {
    background: "transparent",
    border: "none",
    padding: 0,
    font: "inherit",
    fontSize: 11.5,
    color: "var(--tg-accent-dark)",
    cursor: busy ? "default" : "pointer",
    textDecoration: "underline",
    textUnderlineOffset: 2,
  };

  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", marginBottom: 3 }}>
        Passport number
      </div>

      {editing ? (
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value.toUpperCase())}
            onKeyDown={(e) => {
              if (e.key === "Enter") void save();
              if (e.key === "Escape") setEditing(false);
            }}
            placeholder="As printed in the document"
            aria-label="Passport number"
            autoComplete="off"
            spellCheck={false}
            maxLength={20}
            style={{
              flex: 1,
              minWidth: 150,
              border: "1px solid var(--border)",
              borderRadius: 6,
              background: "var(--surface)",
              color: "var(--text)",
              padding: "6px 9px",
              fontSize: 12.5,
              fontFamily: '"JetBrains Mono", monospace',
              letterSpacing: "0.04em",
            }}
          />
          <button type="button" onClick={() => void save()} disabled={busy || !draft.trim()} style={link}>
            {busy ? "Saving" : "Save"}
          </button>
          <button type="button" onClick={() => setEditing(false)} disabled={busy} style={{ ...link, color: "var(--text-muted)" }}>
            Cancel
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <span
            style={{
              fontSize: 12.5,
              fontFamily: revealed ? '"JetBrains Mono", monospace' : "inherit",
              letterSpacing: revealed ? "0.06em" : undefined,
              color: onFile ? "var(--text)" : "var(--text-subtle)",
            }}
          >
            {revealed ?? (onFile ? "On file, encrypted" : "Not on file")}
          </span>

          {onFile && !revealed && (
            <button type="button" onClick={() => void reveal()} disabled={busy} style={link}>
              {busy ? "Checking" : "Show"}
            </button>
          )}
          {revealed && (
            <button type="button" onClick={() => setRevealed(null)} style={link}>
              Hide
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setDraft("");
              setEditing(true);
            }}
            disabled={busy}
            style={{ ...link, color: "var(--text-muted)" }}
          >
            {onFile ? "Replace" : "Add"}
          </button>
          {onFile && (
            <button type="button" onClick={() => void remove()} disabled={busy} style={{ ...link, color: "var(--text-muted)" }}>
              Remove
            </button>
          )}
        </div>
      )}

      {error ? (
        <div role="alert" style={{ fontSize: 11, color: "var(--error)", marginTop: 4 }}>
          {error}
        </div>
      ) : null}
      {revealed ? (
        <div style={{ fontSize: 10.5, color: "var(--text-subtle)", marginTop: 4 }}>
          Recorded against your name. Hides itself shortly.
        </div>
      ) : null}
    </div>
  );
}
