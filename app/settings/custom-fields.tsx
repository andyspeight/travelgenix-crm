"use client";

/**
 * Defining the agency's own fields.
 *
 * Three things an agency can do here: add a field, rename or re-word one, and
 * retire one. What they cannot do is change a field's TYPE or delete it, and
 * both refusals are stated on screen rather than discovered:
 *
 *   A type change would reinterpret every value already recorded — "approx 3"
 *   in a text field becomes nothing at all when it turns into a number, and
 *   no one is told.
 *
 *   A delete would orphan those values. Retiring takes the field off the
 *   customer form and keeps what was written, shown on the record marked as
 *   no longer in use.
 */

import { useEffect, useState } from "react";
import { FIELD_TYPES, type FieldDef, type FieldType } from "@/lib/custom-fields/schema";

export function CustomFieldsSettings() {
  const [fields, setFields] = useState<FieldDef[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState("");
  const [type, setType] = useState<FieldType>("text");
  const [options, setOptions] = useState("");
  const [help, setHelp] = useState("");

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/custom-fields");
        const data = (await res.json()) as { ok: boolean; fields?: FieldDef[] };
        setFields(data.ok ? data.fields ?? [] : []);
      } catch {
        setFields([]);
      }
    })();
  }, []);

  const needsOptions = type === "select" || type === "multi_select";

  async function add() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/custom-fields", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          label,
          type,
          help,
          options: needsOptions ? options.split(",").map((o) => o.trim()) : [],
        }),
      });
      const data = (await res.json()) as { ok: boolean; field?: FieldDef; error?: string };
      if (!data.ok || !data.field) {
        setError(data.error ?? "That field couldn't be saved.");
        return;
      }
      setFields((list) => [...(list ?? []), data.field!]);
      setAdding(false);
      setLabel("");
      setOptions("");
      setHelp("");
      setType("text");
    } catch {
      setError("That didn't save. Check your connection.");
    } finally {
      setBusy(false);
    }
  }

  async function patch(id: string, body: Record<string, unknown>) {
    setError(null);
    try {
      const res = await fetch(`/api/custom-fields/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as { ok: boolean; field?: FieldDef; error?: string };
      if (!data.ok || !data.field) {
        setError(data.error ?? "That didn't save.");
        return;
      }
      setFields((list) => (list ?? []).map((f) => (f.id === id ? data.field! : f)));
    } catch {
      setError("That didn't save. Check your connection.");
    }
  }

  const active = (fields ?? []).filter((f) => !f.archived);
  const retired = (fields ?? []).filter((f) => f.archived);

  return (
    <div>
      <p style={{ fontSize: 12.5, color: "var(--text-muted)", margin: "0 0 12px", lineHeight: 1.6 }}>
        The things you record that the CRM doesn&apos;t know about — a loyalty number, a wedding
        date, which office looks after them. They appear on every customer record.
      </p>

      {fields === null ? (
        <div style={{ fontSize: 12.5, color: "var(--text-subtle)" }}>Loading…</div>
      ) : (
        <>
          {active.length === 0 && (
            <div style={{ fontSize: 12.5, color: "var(--text-subtle)", marginBottom: 10 }}>
              None yet.
            </div>
          )}

          {active.map((field) => (
            <div
              key={field.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "9px 0",
                borderBottom: "1px solid var(--border)",
              }}
            >
              <input
                defaultValue={field.label}
                onBlur={(e) => {
                  const next = e.target.value.trim();
                  if (next && next !== field.label) void patch(field.id, { label: next });
                }}
                style={{
                  flex: 1,
                  minWidth: 0,
                  border: "1px solid transparent",
                  borderRadius: 6,
                  background: "transparent",
                  color: "var(--text)",
                  padding: "4px 6px",
                  fontSize: 13,
                  fontWeight: 600,
                  fontFamily: "inherit",
                }}
              />
              <span style={{ fontSize: 11.5, color: "var(--text-subtle)", whiteSpace: "nowrap" }}>
                {FIELD_TYPES.find((t) => t.id === field.type)?.label ?? field.type}
                {field.options.length > 0 && ` · ${field.options.length} options`}
              </span>
              <button
                onClick={() => void patch(field.id, { archived: true })}
                title="Takes it off the customer form. Anything already recorded is kept."
                style={smallBtn}
              >
                Retire
              </button>
            </div>
          ))}

          {retired.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div
                style={{
                  fontSize: 10.5,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  color: "var(--text-subtle)",
                  marginBottom: 6,
                }}
              >
                Retired
              </div>
              {retired.map((field) => (
                <div
                  key={field.id}
                  style={{ display: "flex", alignItems: "center", gap: 10, padding: "5px 0" }}
                >
                  <span style={{ flex: 1, fontSize: 12.5, color: "var(--text-muted)" }}>
                    {field.label}
                  </span>
                  <button onClick={() => void patch(field.id, { archived: false })} style={smallBtn}>
                    Bring back
                  </button>
                </div>
              ))}
              <div style={{ fontSize: 11, color: "var(--text-subtle)", marginTop: 6, lineHeight: 1.5 }}>
                Retired fields keep what was recorded. Customers who had a value still show it,
                marked as no longer in use.
              </div>
            </div>
          )}

          {/* ─── Add ─────────────────────────────────────────── */}
          {adding ? (
            <div
              style={{
                marginTop: 12,
                border: "1px solid var(--border)",
                borderRadius: 10,
                padding: 12,
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              <input
                autoFocus
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Field name, e.g. Loyalty number"
                style={box}
              />
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {FIELD_TYPES.map((t) => (
                  <button
                    key={t.id}
                    title={t.hint}
                    onClick={() => setType(t.id)}
                    style={{
                      ...smallBtn,
                      borderColor: type === t.id ? "var(--tg-accent-dark)" : "var(--border)",
                      color: type === t.id ? "var(--tg-accent-dark)" : "var(--text-muted)",
                    }}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              {needsOptions && (
                <input
                  value={options}
                  onChange={(e) => setOptions(e.target.value)}
                  placeholder="Options, separated by commas — Leeds, York, Harrogate"
                  style={box}
                />
              )}
              <input
                value={help}
                onChange={(e) => setHelp(e.target.value)}
                placeholder="Hint under the field (optional)"
                style={box}
              />
              <div style={{ fontSize: 11, color: "var(--text-subtle)", lineHeight: 1.5 }}>
                The kind of field can&apos;t be changed later — it would reinterpret every value
                already recorded. Pick carefully, or retire it and add another.
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={() => void add()}
                  disabled={busy || label.trim().length < 2}
                  style={{
                    ...smallBtn,
                    background: "var(--tg-primary)",
                    borderColor: "var(--tg-primary)",
                    color: "white",
                    fontWeight: 600,
                    opacity: busy || label.trim().length < 2 ? 0.6 : 1,
                  }}
                >
                  {busy ? "Adding…" : "Add field"}
                </button>
                <button onClick={() => setAdding(false)} style={{ ...smallBtn, border: "none" }}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button onClick={() => { setAdding(true); setError(null); }} style={{ ...smallBtn, marginTop: 12 }}>
              Add a field
            </button>
          )}

          {error && <div style={{ marginTop: 10, fontSize: 11.5, color: "#dc2626" }}>{error}</div>}
        </>
      )}
    </div>
  );
}

const smallBtn: React.CSSProperties = {
  border: "1px solid var(--border)",
  background: "var(--surface)",
  color: "var(--text-muted)",
  borderRadius: 7,
  padding: "5px 10px",
  fontSize: 11.5,
  fontFamily: "inherit",
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const box: React.CSSProperties = {
  border: "1px solid var(--border)",
  borderRadius: 7,
  background: "var(--surface)",
  color: "var(--text)",
  padding: "6px 9px",
  fontSize: 12.5,
  fontFamily: "inherit",
};
