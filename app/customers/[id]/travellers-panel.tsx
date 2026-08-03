"use client";

/**
 * Travellers — the panel where a passport actually gets entered.
 *
 * Until now the CRM could show whose passport was a problem and offer nowhere
 * to fix it. This is that screen: every traveller on the household, each one
 * expandable to edit name, role, date of birth, passport expiry and country,
 * dietary needs and flags — plus "Add a traveller" for the second passenger
 * an agent takes down over the phone.
 *
 * Passport expiry leads, because it is the field the compliance checks read
 * and the one most often missing. A red dot marks a traveller with no expiry
 * on file when there is a trip to worry about.
 *
 * The full passport NUMBER is not here. That field waits for its encryption
 * key (see lib/contacts/validate); expiry is what the checks use.
 *
 * Each edit saves on blur, one field at a time — these are corrected while
 * someone is on the phone, not filled in as a form.
 */

import { useState } from "react";
import { ROLES, FLAGS, type ContactRole } from "@/lib/contacts/validate";

export type TravellerRow = {
  id: string;
  role: ContactRole;
  first_name: string;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  date_of_birth: string | null;
  passport_expiry: string | null;
  passport_country: string | null;
  dietary: string | null;
  flags: string[];
};

export function TravellersPanel({
  householdId,
  initial,
  /** True when a trip is coming up, so a missing passport is worth flagging. */
  tripPending,
}: {
  householdId: string;
  initial: TravellerRow[];
  tripPending: boolean;
}) {
  const [rows, setRows] = useState<TravellerRow[]>(initial);
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save(id: string, patch: Record<string, unknown>) {
    setSaving(id);
    setError(null);
    try {
      const res = await fetch(`/api/contacts/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = (await res.json()) as { ok: boolean; contact?: TravellerRow; error?: string };
      if (!data.ok || !data.contact) {
        setError(data.error ?? "That didn't save.");
        return;
      }
      setRows((list) => list.map((r) => (r.id === id ? { ...r, ...data.contact! } : r)));
    } catch {
      setError("That didn't save. Check your connection.");
    } finally {
      setSaving(null);
    }
  }

  async function add(fields: Record<string, unknown>) {
    setSaving("new");
    setError(null);
    try {
      const res = await fetch("/api/contacts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ household_id: householdId, ...fields }),
      });
      const data = (await res.json()) as { ok: boolean; contact?: TravellerRow; error?: string };
      if (!data.ok || !data.contact) {
        setError(data.error ?? "That traveller couldn't be added.");
        return;
      }
      setRows((list) => [...list, data.contact!]);
      setAdding(false);
    } catch {
      setError("That didn't save. Check your connection.");
    } finally {
      setSaving(null);
    }
  }

  return (
    <Panel>
      <div style={{ display: "flex", flexDirection: "column" }}>
        {rows.map((r) => (
          <TravellerCard
            key={r.id}
            row={r}
            open={openId === r.id}
            saving={saving === r.id}
            tripPending={tripPending}
            onToggle={() => setOpenId(openId === r.id ? null : r.id)}
            onSave={(patch) => void save(r.id, patch)}
          />
        ))}
      </div>

      {adding ? (
        <AddTraveller busy={saving === "new"} onAdd={add} onCancel={() => setAdding(false)} />
      ) : (
        <button
          onClick={() => { setAdding(true); setError(null); }}
          style={{ ...smallBtn, marginTop: rows.length ? 10 : 0 }}
        >
          + Add a traveller
        </button>
      )}

      {error && <div style={{ marginTop: 8, fontSize: 11.5, color: "#dc2626" }}>{error}</div>}
    </Panel>
  );
}

function TravellerCard({
  row,
  open,
  saving,
  tripPending,
  onToggle,
  onSave,
}: {
  row: TravellerRow;
  open: boolean;
  saving: boolean;
  tripPending: boolean;
  onToggle: () => void;
  onSave: (patch: Record<string, unknown>) => void;
}) {
  const name = [row.first_name, row.last_name].filter(Boolean).join(" ");
  const passportMissing = tripPending && !row.passport_expiry;

  return (
    <div style={{ borderBottom: "1px solid var(--border)", opacity: saving ? 0.6 : 1 }}>
      <button
        onClick={onToggle}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "9px 0",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          textAlign: "left",
          color: "var(--text)",
        }}
      >
        <span
          aria-hidden
          title={passportMissing ? "No passport expiry on file" : undefined}
          style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            flexShrink: 0,
            background: passportMissing ? "#dc2626" : "var(--border-strong, var(--border))",
          }}
        />
        <span style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>{name || "Unnamed traveller"}</span>
        <span style={{ fontSize: 11, color: "var(--text-subtle)" }}>
          {ROLES.find((x) => x.id === row.role)?.label ?? row.role}
        </span>
        <span style={{ fontSize: 11.5, color: passportMissing ? "#b91c1c" : "var(--text-muted)" }}>
          {row.passport_expiry ? `Passport → ${fmt(row.passport_expiry)}` : "Passport not on file"}
        </span>
      </button>

      {open && (
        <div style={{ paddingBottom: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <Field label="First name" defaultValue={row.first_name} onSave={(v) => onSave({ first_name: v })} />
          <Field label="Last name" defaultValue={row.last_name ?? ""} onSave={(v) => onSave({ last_name: v })} />
          <SelectField
            label="Role"
            value={row.role}
            options={ROLES}
            onSave={(v) => onSave({ role: v })}
          />
          <Field label="Date of birth" type="date" defaultValue={row.date_of_birth ?? ""} onSave={(v) => onSave({ date_of_birth: v })} />
          <Field label="Passport expiry" type="date" defaultValue={row.passport_expiry ?? ""} onSave={(v) => onSave({ passport_expiry: v })} />
          <Field label="Passport country" defaultValue={row.passport_country ?? ""} onSave={(v) => onSave({ passport_country: v })} />
          <Field label="Email" defaultValue={row.email ?? ""} onSave={(v) => onSave({ email: v })} />
          <Field label="Phone" defaultValue={row.phone ?? ""} onSave={(v) => onSave({ phone: v })} />
          <div style={{ gridColumn: "1 / -1" }}>
            <Field label="Dietary / notes" defaultValue={row.dietary ?? ""} onSave={(v) => onSave({ dietary: v })} />
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <FlagRow value={row.flags ?? []} onSave={(v) => onSave({ flags: v })} />
          </div>
        </div>
      )}
    </div>
  );
}

function AddTraveller({
  busy,
  onAdd,
  onCancel,
}: {
  busy: boolean;
  onAdd: (fields: Record<string, unknown>) => void;
  onCancel: () => void;
}) {
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [role, setRole] = useState<ContactRole>("partner");
  const [expiry, setExpiry] = useState("");

  return (
    <div style={{ marginTop: 10, border: "1px solid var(--border)", borderRadius: 10, padding: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
      <input autoFocus value={first} onChange={(e) => setFirst(e.target.value)} placeholder="First name" style={box} />
      <input value={last} onChange={(e) => setLast(e.target.value)} placeholder="Last name" style={box} />
      <select value={role} onChange={(e) => setRole(e.target.value as ContactRole)} style={box}>
        {ROLES.map((r) => (
          <option key={r.id} value={r.id}>{r.label}</option>
        ))}
      </select>
      <input value={expiry} onChange={(e) => setExpiry(e.target.value)} type="date" placeholder="Passport expiry" style={box} />
      <div style={{ gridColumn: "1 / -1", display: "flex", gap: 8 }}>
        <button
          onClick={() => onAdd({ first_name: first, last_name: last, role, passport_expiry: expiry })}
          disabled={busy || first.trim().length < 1}
          style={{ ...smallBtn, background: "var(--tg-primary)", borderColor: "var(--tg-primary)", color: "white", fontWeight: 600, opacity: busy || first.trim().length < 1 ? 0.6 : 1 }}
        >
          {busy ? "Adding…" : "Add traveller"}
        </button>
        <button onClick={onCancel} style={{ ...smallBtn, border: "none" }}>Cancel</button>
      </div>
    </div>
  );
}

function Field({
  label,
  defaultValue,
  type = "text",
  onSave,
}: {
  label: string;
  defaultValue: string;
  type?: "text" | "date";
  onSave: (value: string) => void;
}) {
  const [v, setV] = useState(defaultValue);
  return (
    <label style={{ display: "block", fontSize: 11 }}>
      <span style={{ color: "var(--text-subtle)" }}>{label}</span>
      <input
        type={type}
        value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => { if (v !== defaultValue) onSave(v); }}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
        style={{ ...box, marginTop: 2 }}
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  options,
  onSave,
}: {
  label: string;
  value: string;
  options: { id: string; label: string }[];
  onSave: (value: string) => void;
}) {
  return (
    <label style={{ display: "block", fontSize: 11 }}>
      <span style={{ color: "var(--text-subtle)" }}>{label}</span>
      <select value={value} onChange={(e) => onSave(e.target.value)} style={{ ...box, marginTop: 2 }}>
        {options.map((o) => (
          <option key={o.id} value={o.id}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}

function FlagRow({ value, onSave }: { value: string[]; onSave: (value: string[]) => void }) {
  return (
    <div>
      <span style={{ fontSize: 11, color: "var(--text-subtle)" }}>Flags</span>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 3 }}>
        {FLAGS.map((f) => {
          const on = value.includes(f.id);
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => onSave(on ? value.filter((x) => x !== f.id) : [...value, f.id])}
              style={{
                border: `1px solid ${on ? "var(--tg-accent-dark)" : "var(--border)"}`,
                background: on ? "rgba(0,180,216,0.08)" : "transparent",
                color: on ? "var(--tg-accent-dark)" : "var(--text-muted)",
                borderRadius: 20,
                padding: "3px 10px",
                fontSize: 11,
                fontFamily: "inherit",
                cursor: "pointer",
              }}
            >
              {f.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const fmt = (iso: string): string =>
  new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });

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

const smallBtn: React.CSSProperties = {
  border: "1px solid var(--border)",
  background: "var(--surface)",
  color: "var(--text-muted)",
  borderRadius: 7,
  padding: "6px 11px",
  fontSize: 12,
  fontFamily: "inherit",
  cursor: "pointer",
};

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, marginBottom: 16, overflow: "hidden" }}>
      <div style={{ padding: "11px 16px", borderBottom: "1px solid var(--border)", fontSize: 12, fontWeight: 700, letterSpacing: "-0.01em" }}>
        Travellers &amp; passports
      </div>
      <div style={{ padding: 16 }}>{children}</div>
    </div>
  );
}
