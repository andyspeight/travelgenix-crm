"use client";

/**
 * /login — the access-code screen shown when the gate (LUNA_ACCESS_CODE) is
 * enabled. Deliberately minimal: brand mark, one field, one button. On
 * success the signed cookie is set server-side and we return the user to
 * where they were heading.
 */

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";

function LoginForm() {
  const params = useSearchParams();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/auth/access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error || "That code isn't right");
      const from = params.get("from");
      window.location.href = from && from.startsWith("/") ? from : "/";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      style={{
        width: "min(360px, 92vw)",
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 16,
        padding: 28,
        boxShadow: "var(--shadow-lg)",
        display: "flex",
        flexDirection: "column",
        gap: 14,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div
          style={{
            width: 34,
            height: 34,
            background: "linear-gradient(135deg, var(--tg-primary) 0%, var(--tg-accent) 100%)",
            borderRadius: 9,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "white",
            fontWeight: 800,
            fontSize: 15,
          }}
        >
          L
        </div>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text)" }}>Luna Work</div>
          <div style={{ fontSize: 10.5, color: "var(--text-subtle)", letterSpacing: "0.04em", textTransform: "uppercase" }}>
            Travelgenix
          </div>
        </div>
      </div>

      <div style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.5 }}>
        This workspace is protected. Enter the access code to continue.
      </div>

      <input
        autoFocus
        type="password"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder="Access code"
        autoComplete="current-password"
        style={{
          border: "1px solid var(--border)",
          borderRadius: 8,
          background: "var(--bg-subtle)",
          color: "var(--text)",
          padding: "10px 12px",
          fontSize: 14,
          fontFamily: "inherit",
        }}
      />

      {error && <div style={{ fontSize: 12.5, color: "var(--error)" }}>{error}</div>}

      <button
        type="submit"
        disabled={busy || !code.trim()}
        style={{
          background: "var(--tg-primary)",
          border: "none",
          borderRadius: 8,
          padding: "10px 0",
          fontSize: 14,
          fontWeight: 600,
          color: "white",
          cursor: busy || !code.trim() ? "default" : "pointer",
          opacity: busy || !code.trim() ? 0.6 : 1,
        }}
      >
        {busy ? "Checking…" : "Enter"}
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        background: "var(--bg)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
