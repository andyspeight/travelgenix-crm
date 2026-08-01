"use client";

/**
 * The custom fields on a customer.
 *
 * Whatever this agency decided to record that no other agency does. Each one
 * saves on its own, on blur, because these get filled in one at a time while
 * someone is on the phone rather than as a form with a Save button at the
 * bottom.
 *
 * A field that has been archived but still holds a value is shown at the
 * bottom, read-only, labelled. The alternative is a number that was typed in
 * and then vanished when someone tidied the settings, which is the sort of
 * loss nobody notices until they need it.
 */

import { useState } from "react";
import {
  displayValue,
  sortDefs,
  archivedWithValues,
  type FieldDef,
  type CustomValues,
  type FieldValue,
} from "@/lib/custom-fields/schema";

export function CustomFieldsPanel({
  householdId,
  fields,
  initial,
}: {
  householdId: string;
  fields: FieldDef[];
  initial: CustomValues;
}) {
  const [values, setValues] = useState<CustomValues>(initial ?? {});
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const active = sortDefs(fields.filter((f) => !f.archived));
  const retired = archivedWithValues(fields, values);

  // Nothing defined and nothing left behind: say what this is for rather than
  // rendering an empty box.
  if (active.length === 0 && retired.length === 0) {
    return (
      <Panel>
        <div style={{ fontSize: 12.5, color: "var(--text-muted)", lineHeight: 1.55 }}>
          No custom fields yet. Add the things you record that the CRM doesn&apos;t know about — a
          loyalty number, a wedding date, which office looks after them — in Settings.
        </div>
      </Panel>
    );
  }

  async function save(key: string, value: FieldValue) {
    setSaving(key);
    setError(null);
    try {
      const res = await fetch(`/api/customers/${householdId}/custom`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ values: { [key]: value } }),
      });
      const data = (await res.json()) as { ok: boolean; custom?: CustomValues; error?: string };
      if (!data.ok) {
        setError(data.error ?? "That didn't save.");
        return;
      }
      // Take back what the server stored, not what we hoped it would.
      if (data.custom) setValues(data.custom);
    } catch {
      setError("That didn't save. Check your connection.");
    } finally {
      setSaving(null);
    }
  }

  return (
    <Panel>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {active.map((field) => (
          <div key={field.id} style={{ opacity: saving === field.key ? 0.55 : 1 }}>
            <label
              htmlFor={`cf-${field.id}`}
              style={{
                display: "block",
                fontSize: 11,
                fontWeight: 600,
                color: "var(--text-muted)",
                marginBottom: 3,
              }}
            >
              {field.label}
            </label>
            <FieldInput
              id={`cf-${field.id}`}
              field={field}
              value={values[field.key] ?? null}
              onSave={(v) => void save(field.key, v)}
            />
            {field.help && (
              <div style={{ fontSize: 11, color: "var(--text-subtle)", marginTop: 3 }}>{field.help}</div>
            )}
          </div>
        ))}
      </div>

      {retired.length > 0 && (
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
          <div style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-subtle)", marginBottom: 6 }}>
            No longer in use
          </div>
          {retired.map((field) => (
            <div key={field.id} style={{ fontSize: 12.5, marginBottom: 4 }}>
              <span style={{ color: "var(--text-muted)" }}>{field.label}: </span>
              <span style={{ color: "var(--text)" }}>{displayValue(field, values[field.key] ?? null)}</span>
            </div>
          ))}
          <div style={{ fontSize: 11, color: "var(--text-subtle)", marginTop: 4, lineHeight: 1.5 }}>
            These fields were retired in Settings. What was recorded is kept.
          </div>
        </div>
      )}

      {error && <div style={{ marginTop: 10, fontSize: 11.5, color: "#dc2626" }}>{error}</div>}
    </Panel>
  );
}

function FieldInput({
  id,
  field,
  value,
  onSave,
}: {
  id: string;
  field: FieldDef;
  value: FieldValue;
  onSave: (value: FieldValue) => void;
}) {
  const [draft, setDraft] = useState(
    value === null || value === undefined ? "" : String(value)
  );

  const box: React.CSSProperties = {
    width: "100%",
    border: "1px solid var(--border)",
    borderRadius: 7,
    background: "var(--surface)",
    color: "var(--text)",
    padding: "6px 9px",
    fontSize: 12.5,
    fontFamily: "inherit",
  };

  if (field.type === "checkbox") {
    return (
      <label style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12.5, cursor: "pointer" }}>
        <input
          id={id}
          type="checkbox"
          checked={value === true}
          onChange={(e) => onSave(e.target.checked)}
        />
        {value === true ? "Yes" : "No"}
      </label>
    );
  }

  if (field.type === "select") {
    const missing = typeof value === "string" && value && !field.options.includes(value);
    return (
      <select
        id={id}
        value={typeof value === "string" ? value : ""}
        onChange={(e) => onSave(e.target.value || null)}
        style={box}
      >
        <option value="">—</option>
        {/* A value whose option was removed still shows, so it is not lost
            the moment someone edits the list. */}
        {missing && <option value={value as string}>{value} (no longer an option)</option>}
        {field.options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    );
  }

  if (field.type === "multi_select") {
    const picked = Array.isArray(value) ? value : [];
    return (
      <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
        {field.options.map((option) => {
          const on = picked.includes(option);
          return (
            <button
              key={option}
              type="button"
              onClick={() =>
                onSave(on ? picked.filter((p) => p !== option) : [...picked, option])
              }
              style={{
                border: `1px solid ${on ? "var(--tg-accent-dark)" : "var(--border)"}`,
                background: on ? "rgba(0,180,216,0.08)" : "transparent",
                color: on ? "var(--tg-accent-dark)" : "var(--text-muted)",
                borderRadius: 20,
                padding: "3px 10px",
                fontSize: 11.5,
                fontFamily: "inherit",
                cursor: "pointer",
              }}
            >
              {option}
            </button>
          );
        })}
        {picked
          .filter((p) => !field.options.includes(p))
          .map((orphan) => (
            <span key={orphan} style={{ fontSize: 11.5, color: "var(--text-subtle)", alignSelf: "center" }}>
              {orphan} (no longer an option)
            </span>
          ))}
      </div>
    );
  }

  return (
    <input
      id={id}
      type={field.type === "date" ? "date" : "text"}
      inputMode={field.type === "number" ? "decimal" : undefined}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        const trimmed = draft.trim();
        const next: FieldValue =
          trimmed === "" ? null : field.type === "number" ? Number(trimmed.replace(/[£,\s]/g, "")) : trimmed;
        if (field.type === "number" && next !== null && !Number.isFinite(next as number)) return;
        if (String(next ?? "") !== String(value ?? "")) onSave(next);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
      style={box}
    />
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        marginBottom: 16,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "11px 16px",
          borderBottom: "1px solid var(--border)",
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: "-0.01em",
        }}
      >
        Your fields
      </div>
      <div style={{ padding: 16 }}>{children}</div>
    </div>
  );
}
