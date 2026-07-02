"use client";

/**
 * The import wizard. Three steps:
 *
 *   1. upload  — drop/choose a CSV. Parsed entirely in the browser.
 *   2. review  — Luna's column mapping (headers + 5 sample rows go to
 *                /api/import/map), with a per-column override dropdown and a
 *                live preview of the customers as they'll import, plus every
 *                skipped row and warning. Change a dropdown and the preview
 *                recomputes instantly — the mapping is pure client-side code.
 *   3. done    — batched import via /api/import/customers with dedupe, then
 *                the honest totals: created, duplicates skipped, invalid rows.
 */

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { parseCsv, type ParsedCsv } from "@/lib/import/csv";
import {
  TARGET_FIELDS,
  applyMapping,
  type ColumnMapping,
  type TargetField,
} from "@/lib/import/schema";
import { SparklesIcon, UsersIcon } from "@/components/ui/icons";

type Step = "upload" | "review" | "importing" | "done";

const BATCH = 200;

export function ImportWizard() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>("upload");
  const [fileName, setFileName] = useState("");
  const [csv, setCsv] = useState<ParsedCsv | null>(null);
  const [mappings, setMappings] = useState<ColumnMapping[]>([]);
  const [engine, setEngine] = useState<"luna" | "rules">("rules");
  const [mappingLoading, setMappingLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [totals, setTotals] = useState({ created: 0, skippedDuplicates: 0, skippedInvalid: 0 });
  const [dragOver, setDragOver] = useState(false);

  // Live preview — recomputes whenever a dropdown changes. Pure client code.
  const preview = useMemo(() => {
    if (!csv) return null;
    return applyMapping(csv.headers, csv.rows, mappings);
  }, [csv, mappings]);

  async function handleFile(file: File) {
    setError(null);
    if (!/\.(csv|txt)$/i.test(file.name)) {
      setError("Please choose a .csv file (export one from your old CRM or spreadsheet).");
      return;
    }
    const text = await file.text();
    const parsed = parseCsv(text);
    if (parsed.headers.length === 0 || parsed.rows.length === 0) {
      setError("That file looks empty — it needs a header row and at least one customer row.");
      return;
    }
    setFileName(file.name);
    setCsv(parsed);
    setMappingLoading(true);
    setStep("review");
    try {
      const res = await fetch("/api/import/map", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ headers: parsed.headers, samples: parsed.rows.slice(0, 5) }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        mappings?: ColumnMapping[];
        engine?: "luna" | "rules";
      };
      if (data.ok && data.mappings) {
        setMappings(data.mappings);
        setEngine(data.engine ?? "rules");
      } else {
        throw new Error("mapping failed");
      }
    } catch {
      // The client can still self-serve: map everything to ignore and let the
      // user set the dropdowns. But better: local heuristics live server-side;
      // simplest honest fallback here is name-position guesses = ignore.
      setMappings(parsed.headers.map((h) => ({ source: h, target: "ignore" as TargetField })));
      setEngine("rules");
      setError("Automatic mapping was unavailable — set each column below by hand.");
    } finally {
      setMappingLoading(false);
    }
  }

  function setTarget(source: string, target: TargetField) {
    setMappings((ms) => {
      // Single-value targets move: picking "Email" for column B unsets it on A.
      const multi = new Set<TargetField>(["ignore", "tags", "notes"]);
      return ms.map((m) => {
        if (m.source === source) return { ...m, target };
        if (!multi.has(target) && m.target === target) return { ...m, target: "ignore" as TargetField };
        return m;
      });
    });
  }

  async function runImport() {
    if (!preview || preview.customers.length === 0) return;
    setStep("importing");
    setError(null);
    let created = 0;
    let dup = 0;
    let invalid = 0;
    const all = preview.customers;
    for (let i = 0; i < all.length; i += BATCH) {
      const chunk = all.slice(i, i + BATCH);
      try {
        const res = await fetch("/api/import/customers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ customers: chunk }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          created?: number;
          skippedDuplicates?: number;
          skippedInvalid?: number;
          error?: string;
        };
        if (!res.ok || !data.ok) throw new Error(data.error || `Import failed (${res.status})`);
        created += data.created ?? 0;
        dup += data.skippedDuplicates ?? 0;
        invalid += data.skippedInvalid ?? 0;
        setProgress(Math.min(100, Math.round(((i + chunk.length) / all.length) * 100)));
      } catch (err) {
        setError(
          `${err instanceof Error ? err.message : "Import failed"} — ${created} imported before the error. Re-running skips anything already imported.`
        );
        break;
      }
    }
    setTotals({ created, skippedDuplicates: dup, skippedInvalid: invalid });
    setStep("done");
    router.refresh();
  }

  // ─── Step: upload ─────────────────────────────────────────────────────
  if (step === "upload") {
    return (
      <div>
        <Intro />
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const f = e.dataTransfer.files?.[0];
            if (f) handleFile(f);
          }}
          onClick={() => fileRef.current?.click()}
          style={{
            border: `2px dashed ${dragOver ? "var(--tg-accent)" : "var(--border-strong)"}`,
            background: dragOver ? "rgba(0,180,216,0.04)" : "var(--surface)",
            borderRadius: 14,
            padding: "56px 24px",
            textAlign: "center",
            cursor: "pointer",
            transition: "all 0.15s ease",
          }}
        >
          <div
            style={{
              width: 46,
              height: 46,
              borderRadius: 12,
              background: "linear-gradient(135deg, var(--tg-primary) 0%, var(--tg-accent) 100%)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              color: "white",
              marginBottom: 14,
            }}
          >
            <UsersIcon width={20} height={20} />
          </div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text)", marginBottom: 4 }}>
            Drop your CSV here, or click to choose
          </div>
          <div style={{ fontSize: 13, color: "var(--text-muted)", maxWidth: 460, margin: "0 auto" }}>
            Export your customers from your old CRM or spreadsheet as a CSV. Any column names,
            any order — Luna works out what's what.
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv,.txt"
            style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
              e.target.value = "";
            }}
          />
        </div>
        {error && <p style={{ color: "var(--error)", fontSize: 13, marginTop: 12 }}>{error}</p>}
      </div>
    );
  }

  // ─── Step: review ─────────────────────────────────────────────────────
  if (step === "review" && csv) {
    const ready = preview?.customers.length ?? 0;
    const sample = csv.rows[0] ?? [];
    return (
      <div>
        <Intro />
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginBottom: 14,
            flexWrap: "wrap",
          }}
        >
          <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--text)" }}>{fileName}</span>
          <span style={{ fontSize: 12.5, color: "var(--text-muted)" }}>
            {csv.rows.length} rows · {csv.headers.length} columns
          </span>
          {mappingLoading ? (
            <Badge tone="wait">Luna is reading your columns…</Badge>
          ) : engine === "luna" ? (
            <Badge tone="luna">✦ Mapped by Luna — check and adjust below</Badge>
          ) : (
            <Badge tone="plain">Mapped by rules — check and adjust below</Badge>
          )}
          <div style={{ flex: 1 }} />
          <button onClick={() => { setStep("upload"); setCsv(null); setError(null); }} style={ghostBtn}>
            Different file
          </button>
        </div>

        {/* Column mapping table */}
        <div
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            overflow: "hidden",
            marginBottom: 16,
          }}
        >
          {csv.headers.map((h, i) => {
            const m = mappings.find((x) => x.source === h);
            return (
              <div
                key={h + i}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr 1fr",
                  gap: 10,
                  alignItems: "center",
                  padding: "9px 14px",
                  borderBottom: i === csv.headers.length - 1 ? "none" : "1px solid var(--border)",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {h || "(unnamed column)"}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-subtle)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    e.g. {sample[i]?.trim() ? sample[i].slice(0, 40) : "—"}
                  </div>
                </div>
                <div style={{ fontSize: 12, color: "var(--text-subtle)", textAlign: "center" }}>→</div>
                <select
                  value={m?.target ?? "ignore"}
                  onChange={(e) => setTarget(h, e.target.value as TargetField)}
                  style={{
                    width: "100%",
                    border: "1px solid var(--border)",
                    borderRadius: 7,
                    background: (m?.target ?? "ignore") === "ignore" ? "var(--bg-subtle)" : "var(--surface)",
                    color: (m?.target ?? "ignore") === "ignore" ? "var(--text-subtle)" : "var(--text)",
                    padding: "6px 9px",
                    fontSize: 12.5,
                    fontFamily: "inherit",
                  }}
                >
                  {TARGET_FIELDS.map((f) => (
                    <option key={f.key} value={f.key}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </div>
            );
          })}
        </div>

        {/* Live preview */}
        {preview && (
          <div
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 12,
              padding: 16,
              marginBottom: 16,
            }}
          >
            <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text)", marginBottom: 10 }}>
              Preview — how they'll import
            </div>
            {preview.customers.slice(0, 6).map((c, i) => (
              <div key={i} style={{ display: "flex", gap: 10, alignItems: "baseline", padding: "6px 0", borderBottom: "1px solid var(--border)", fontSize: 12.5 }}>
                <span style={{ fontWeight: 600, color: "var(--text)" }}>{c.display_name}</span>
                <span style={{ color: "var(--text-muted)" }}>
                  {[c.lead.email, c.lead.phone, c.city, c.household_type, c.lifetime_value != null ? `£${c.lifetime_value.toLocaleString("en-GB")}` : null]
                    .filter(Boolean)
                    .join(" · ") || "no details mapped yet"}
                </span>
                {c.tags.length > 0 && <span style={{ color: "var(--tg-accent-dark)", fontSize: 11.5 }}>{c.tags.join(", ")}</span>}
              </div>
            ))}
            <div style={{ display: "flex", gap: 14, marginTop: 10, fontSize: 12.5, flexWrap: "wrap" }}>
              <span style={{ color: "var(--success)", fontWeight: 600 }}>{ready} ready to import</span>
              {preview.skipped.length > 0 && (
                <span style={{ color: "var(--error)" }}>{preview.skipped.length} rows can't import (no name or email)</span>
              )}
              {preview.warnings.length > 0 && (
                <span style={{ color: "var(--warning)" }}>{preview.warnings.length} small issues (bad emails/dates left blank)</span>
              )}
            </div>
            {(preview.skipped.length > 0 || preview.warnings.length > 0) && (
              <details style={{ marginTop: 8 }}>
                <summary style={{ fontSize: 12, color: "var(--text-muted)", cursor: "pointer" }}>Show details</summary>
                <ul style={{ margin: "6px 0 0", paddingLeft: 18, fontSize: 11.5, color: "var(--text-muted)" }}>
                  {[...preview.skipped, ...preview.warnings].slice(0, 30).map((x, i) => (
                    <li key={i}>Row {x.row}: {x.message}</li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}

        {error && <p style={{ color: "var(--warning)", fontSize: 12.5, marginBottom: 12 }}>{error}</p>}

        <button
          onClick={runImport}
          disabled={mappingLoading || ready === 0}
          style={{
            background: ready > 0 ? "var(--tg-primary)" : "var(--bg-subtle)",
            color: ready > 0 ? "white" : "var(--text-subtle)",
            border: "none",
            borderRadius: 8,
            padding: "10px 18px",
            fontSize: 14,
            fontWeight: 600,
            cursor: ready > 0 ? "pointer" : "default",
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <SparklesIcon width={15} height={15} />
          Import {ready} customer{ready === 1 ? "" : "s"}
        </button>
        <p style={{ fontSize: 11.5, color: "var(--text-subtle)", marginTop: 8 }}>
          Safe to re-run: customers that already exist (same name or email) are skipped, never duplicated.
        </p>
      </div>
    );
  }

  // ─── Step: importing ──────────────────────────────────────────────────
  if (step === "importing") {
    return (
      <div style={{ textAlign: "center", padding: "60px 0" }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text)", marginBottom: 14 }}>
          Importing… {progress}%
        </div>
        <div style={{ maxWidth: 360, margin: "0 auto", height: 8, background: "var(--bg-subtle)", borderRadius: 5, overflow: "hidden" }}>
          <div style={{ width: `${progress}%`, height: "100%", background: "var(--tg-accent)", transition: "width 0.3s ease" }} />
        </div>
      </div>
    );
  }

  // ─── Step: done ───────────────────────────────────────────────────────
  return (
    <div style={{ textAlign: "center", padding: "40px 0" }}>
      <div
        style={{
          width: 52,
          height: 52,
          borderRadius: 14,
          background: "rgba(16,185,129,0.1)",
          color: "var(--success)",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 24,
          marginBottom: 14,
        }}
      >
        ✓
      </div>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: "var(--text)", margin: "0 0 6px" }}>
        {totals.created} customer{totals.created === 1 ? "" : "s"} imported
      </h2>
      <p style={{ fontSize: 13.5, color: "var(--text-muted)", margin: "0 0 4px" }}>
        {totals.skippedDuplicates > 0 && `${totals.skippedDuplicates} already existed and were skipped. `}
        {totals.skippedInvalid > 0 && `${totals.skippedInvalid} rows had no usable name or email.`}
        {totals.skippedDuplicates === 0 && totals.skippedInvalid === 0 && "No duplicates, no problems."}
      </p>
      {error && <p style={{ color: "var(--error)", fontSize: 13, maxWidth: 480, margin: "8px auto" }}>{error}</p>}
      <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 18 }}>
        <Link
          href="/customers"
          style={{
            background: "var(--tg-primary)",
            color: "white",
            borderRadius: 8,
            padding: "9px 16px",
            fontSize: 13.5,
            fontWeight: 600,
            textDecoration: "none",
          }}
        >
          See your customers →
        </Link>
        <button onClick={() => { setStep("upload"); setCsv(null); setError(null); setProgress(0); }} style={ghostBtn}>
          Import another file
        </button>
      </div>
    </div>
  );
}

// ─── Bits ───────────────────────────────────────────────────────────────────

const ghostBtn: React.CSSProperties = {
  background: "transparent",
  border: "1px solid var(--border)",
  borderRadius: 8,
  padding: "8px 14px",
  fontSize: 13,
  fontWeight: 500,
  color: "var(--text-muted)",
  cursor: "pointer",
};

function Intro() {
  return (
    <div style={{ marginBottom: 18 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em", margin: "0 0 4px", color: "var(--text)" }}>
        Bring your customers with you
      </h1>
      <p style={{ fontSize: 13.5, color: "var(--text-muted)", margin: 0, maxWidth: 560 }}>
        Drop in a CSV from any CRM or spreadsheet. Luna reads the columns and maps them for you —
        you just check the preview and import. One row becomes one customer with their lead contact.
      </p>
    </div>
  );
}

function Badge({ tone, children }: { tone: "luna" | "rules" | "wait" | "plain"; children: React.ReactNode }) {
  const styles: Record<string, React.CSSProperties> = {
    luna: { background: "rgba(0,180,216,0.08)", color: "var(--tg-accent-dark)", border: "1px solid rgba(0,180,216,0.25)" },
    wait: { background: "var(--bg-subtle)", color: "var(--text-muted)", border: "1px solid var(--border)" },
    plain: { background: "var(--bg-subtle)", color: "var(--text-muted)", border: "1px solid var(--border)" },
  };
  return (
    <span style={{ ...styles[tone === "rules" ? "plain" : tone], fontSize: 11.5, fontWeight: 600, padding: "3px 10px", borderRadius: 999 }}>
      {children}
    </span>
  );
}
