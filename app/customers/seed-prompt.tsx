"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SparklesIcon } from "@/components/ui/icons";

export function SeedPrompt() {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "seeding" | "done" | "error">(
    "idle"
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [counts, setCounts] = useState<Record<string, number> | null>(null);

  async function seed() {
    setStatus("seeding");
    setErrorMsg(null);
    try {
      const res = await fetch("/api/seed", { method: "POST" });
      const data = await res.json();
      if (!data.ok) {
        setStatus("error");
        setErrorMsg(`${data.step ?? "unknown step"}: ${data.error ?? "unknown error"}`);
        return;
      }
      setStatus("done");
      setCounts(data.counts ?? null);
      // Wait a moment so the user sees the "done" state, then refresh
      setTimeout(() => router.refresh(), 1500);
    } catch (e) {
      setStatus("error");
      setErrorMsg(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 14,
        padding: "60px 28px",
        textAlign: "center",
      }}
    >
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: 14,
          background:
            "linear-gradient(135deg, rgba(0, 180, 216, 0.12) 0%, rgba(72, 202, 228, 0.05) 100%)",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--tg-accent-dark)",
          marginBottom: 16,
          border: "1px solid rgba(0, 180, 216, 0.2)",
        }}
      >
        <SparklesIcon width={26} height={26} />
      </div>

      <h2
        style={{
          fontSize: 22,
          fontWeight: 700,
          margin: "0 0 8px",
          color: "var(--text)",
          letterSpacing: "-0.01em",
        }}
      >
        Seed the database
      </h2>
      <p
        style={{
          fontSize: 14,
          color: "var(--text-muted)",
          margin: "0 auto 20px",
          maxWidth: 540,
          lineHeight: 1.55,
        }}
      >
        Click below to insert 30 realistic households, ~60 contacts, ~50 trips,
        ~20 interactions, and a handful of suppliers and preferences. Takes
        about 5 seconds. Idempotent — safe to click again, won't duplicate.
      </p>

      {status === "idle" && (
        <button
          onClick={seed}
          style={{
            background: "var(--tg-primary)",
            color: "white",
            border: "none",
            borderRadius: 8,
            padding: "10px 18px",
            fontSize: 14,
            fontWeight: 600,
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            transition: "all 0.15s ease",
          }}
        >
          <SparklesIcon width={15} height={15} />
          Seed database
        </button>
      )}

      {status === "seeding" && (
        <div style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
          <span
            style={{
              width: 14,
              height: 14,
              borderRadius: "50%",
              border: "2px solid var(--tg-accent)",
              borderRightColor: "transparent",
              animation: "spin 0.8s linear infinite",
              display: "inline-block",
            }}
          />
          <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
            Inserting suppliers, households, contacts, trips, interactions…
          </span>
          <style>{`
            @keyframes spin { to { transform: rotate(360deg); } }
          `}</style>
        </div>
      )}

      {status === "done" && (
        <div
          style={{
            display: "inline-flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 8,
          }}
        >
          <div
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: "var(--success)",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            ✓ Seeded successfully
          </div>
          {counts && (
            <div
              style={{
                fontSize: 12,
                color: "var(--text-muted)",
                fontFamily: '"JetBrains Mono", monospace',
              }}
            >
              {Object.entries(counts)
                .map(([k, v]) => `${v} ${k}`)
                .join(" · ")}
            </div>
          )}
          <div style={{ fontSize: 12, color: "var(--text-subtle)" }}>
            Refreshing in a moment…
          </div>
        </div>
      )}

      {status === "error" && (
        <div
          style={{
            background: "rgba(239, 68, 68, 0.06)",
            border: "1px solid rgba(239, 68, 68, 0.2)",
            borderRadius: 8,
            padding: "10px 14px",
            display: "inline-block",
            textAlign: "left",
            maxWidth: 500,
          }}
        >
          <div style={{ fontWeight: 600, color: "var(--error)", marginBottom: 4 }}>
            Seed failed
          </div>
          <div
            style={{
              fontSize: 12,
              color: "var(--text-muted)",
              fontFamily: '"JetBrains Mono", monospace',
              wordBreak: "break-word",
            }}
          >
            {errorMsg}
          </div>
          <div style={{ marginTop: 10 }}>
            <button
              onClick={seed}
              style={{
                background: "var(--tg-primary)",
                color: "white",
                border: "none",
                borderRadius: 6,
                padding: "6px 12px",
                fontSize: 12,
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              Try again
            </button>
          </div>
        </div>
      )}

      <div style={{ marginTop: 18, fontSize: 12.5, color: "var(--text-muted)" }}>
        Bringing real customers from another CRM?{" "}
        <a href="/customers/import" style={{ color: "var(--tg-accent-dark)", fontWeight: 600, textDecoration: "none" }}>
          Import a CSV
        </a>{" "}
        — Luna maps the columns for you.
      </div>

      <div
        style={{
          marginTop: 14,
          fontSize: 11.5,
          color: "var(--text-subtle)",
        }}
      >
        Or paste{" "}
        <code
          style={{
            fontFamily: '"JetBrains Mono", monospace',
            background: "var(--bg-subtle)",
            padding: "1px 6px",
            borderRadius: 4,
          }}
        >
          supabase/seed.sql
        </code>{" "}
        into the Supabase SQL Editor as a fallback.
      </div>
    </div>
  );
}
