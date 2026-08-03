"use client";

/**
 * The commission screen.
 *
 * Three things, in the order an owner cares about them:
 *
 *   1. WHAT WE EARNED — received, invoiced and expected as three separate
 *      numbers, never added into one cheerful total, with turnover beside
 *      them for contrast and the caveat underneath when bookings had to be
 *      left out.
 *   2. WHO OWES US — the chase list. This is the part that turns into money.
 *   3. EVERY BOOKING — editable in place, because commission is entered a
 *      field at a time while the agent is on the phone to the operator.
 *
 * Edits save on blur, one field at a time. There is no Save button because
 * there is no form: a row is a record being corrected, not a document being
 * filled in.
 */

import { useState } from "react";
import Link from "next/link";
import type { CommissionSummary, ChaseItem } from "@/lib/commission/calc";
import { money } from "@/lib/commission/calc";

export type SupplierRow = {
  id: string;
  name: string;
  category: string | null;
  default_commission_rate: number | null;
  payment_terms_days: number | null;
};

export type CommissionRow = {
  id: string;
  householdId: string;
  customer: string;
  destination: string | null;
  departDate: string | null;
  totalValue: number | null;
  supplierId: string | null;
  rate: number | null;
  amount: number | null;
  status: "expected" | "invoiced" | "received" | "written_off";
  dueAt: string | null;
  receivedAt: string | null;
  note: string | null;
  /** What we worked out it is worth, or null when nothing is recorded. */
  computed: number | null;
  computedFrom: "amount" | "trip_rate" | "supplier_rate" | "unknown";
  computedReason: string;
  dueDate: string | null;
  dueReason: string;
  ageingState: "received" | "written_off" | "not_due" | "due_soon" | "overdue" | "unknown";
  ageingLabel: string;
};

const STATUS_LABEL: Record<CommissionRow["status"], string> = {
  expected: "Expected",
  invoiced: "Invoiced",
  received: "Received",
  written_off: "Written off",
};

const cell: React.CSSProperties = {
  padding: "9px 10px",
  fontSize: 12.5,
  color: "var(--text)",
  borderTop: "1px solid var(--border)",
  verticalAlign: "top",
};

const input: React.CSSProperties = {
  width: "100%",
  border: "1px solid transparent",
  borderRadius: 6,
  background: "transparent",
  color: "var(--text)",
  padding: "4px 6px",
  fontSize: 12.5,
  fontFamily: "inherit",
};

export function CommissionView({
  rows,
  suppliers,
  summary,
  chases,
}: {
  rows: CommissionRow[];
  suppliers: SupplierRow[];
  summary: CommissionSummary;
  chases: ChaseItem[];
}) {
  const [items, setItems] = useState(rows);
  const [supplierList, setSupplierList] = useState(suppliers);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const nameOf = (id: string | null) =>
    id ? supplierList.find((s) => s.id === id)?.name ?? "Unknown supplier" : null;

  async function saveTrip(id: string, patch: Record<string, unknown>) {
    setSaving(id);
    setError(null);
    try {
      const res = await fetch(`/api/trips/${id}/commission`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = (await res.json()) as { ok: boolean; error?: string; trip?: Record<string, unknown> };
      if (!data.ok) {
        setError(data.error ?? "That didn't save.");
        return;
      }
      // Optimistic-but-honest: take back exactly what the server stored.
      setItems((list) =>
        list.map((row) =>
          row.id === id
            ? {
                ...row,
                supplierId: (data.trip?.supplier_id as string | null) ?? null,
                rate: (data.trip?.commission_rate as number | null) ?? null,
                amount: (data.trip?.commission_amount as number | null) ?? null,
                status: (data.trip?.commission_status as CommissionRow["status"]) ?? row.status,
                dueAt: (data.trip?.commission_due_at as string | null) ?? null,
                receivedAt: (data.trip?.commission_received_at as string | null) ?? null,
                note: (data.trip?.commission_note as string | null) ?? null,
              }
            : row
        )
      );
    } catch {
      setError("That didn't save. Check your connection.");
    } finally {
      setSaving(null);
    }
  }

  async function saveSupplier(id: string, patch: Record<string, unknown>) {
    setError(null);
    try {
      const res = await fetch(`/api/suppliers/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = (await res.json()) as { ok: boolean; error?: string; supplier?: SupplierRow };
      if (!data.ok || !data.supplier) {
        setError(data.error ?? "That didn't save.");
        return;
      }
      setSupplierList((list) =>
        list.map((s) => (s.id === id ? { ...s, ...data.supplier! } : s))
      );
    } catch {
      setError("That didn't save. Check your connection.");
    }
  }

  const [addingSupplier, setAddingSupplier] = useState(false);
  const [newName, setNewName] = useState("");

  async function addSupplier() {
    const name = newName.trim();
    if (name.length < 2) return;
    setError(null);
    try {
      const res = await fetch("/api/suppliers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = (await res.json()) as { ok: boolean; supplier?: SupplierRow; error?: string };
      if (!data.ok || !data.supplier) {
        setError(data.error ?? "That supplier couldn't be added.");
        return;
      }
      setSupplierList((list) => [...list, data.supplier!].sort((a, b) => a.name.localeCompare(b.name)));
      setNewName("");
      setAddingSupplier(false);
    } catch {
      setError("That didn't save. Check your connection.");
    }
  }

  const unpaid = items.filter((r) => r.status === "expected" || r.status === "invoiced");
  const visible = showAll ? items : unpaid;

  return (
    <div style={{ padding: 28, maxWidth: 1400, margin: "0 auto", width: "100%" }}>
      {/* ─── What we earned ───────────────────────────────────── */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 26, marginBottom: 6 }}>
        <Figure label="Received" value={money(summary.received)} strong note="In the bank" />
        <Figure label="Invoiced" value={money(summary.invoiced)} note="Billed, not yet paid" />
        <Figure label="Expected" value={money(summary.expected)} note="Not yet invoiced" />
        <Figure
          label="Overdue"
          value={money(summary.overdue)}
          note={summary.overdue > 0 ? "Past the supplier's terms" : "Nothing late"}
          danger={summary.overdue > 0}
        />
        <Figure
          label="Turnover"
          value={money(summary.turnover)}
          note="What customers paid, for contrast"
          muted
        />
      </div>

      {summary.caveat && (
        <div
          style={{
            fontSize: 12,
            color: "#b45309",
            background: "rgba(180, 83, 9, 0.06)",
            border: "1px solid rgba(180, 83, 9, 0.18)",
            borderRadius: 8,
            padding: "8px 12px",
            marginBottom: 18,
            lineHeight: 1.5,
          }}
        >
          {summary.caveat}
        </div>
      )}

      {error && (
        <div style={{ fontSize: 12, color: "#dc2626", marginBottom: 12 }}>{error}</div>
      )}

      {/* ─── Who owes us ──────────────────────────────────────── */}
      {chases.length > 0 && (
        <section style={{ marginTop: 18, marginBottom: 26 }}>
          <h2 style={{ fontSize: 13, fontWeight: 700, margin: "0 0 10px" }}>
            Owed to you{" "}
            <span style={{ fontWeight: 400, color: "var(--text-muted)" }}>
              — {chases.length} booking{chases.length === 1 ? "" : "s"}, {money(summary.overdue)} past terms
            </span>
          </h2>
          <div
            style={{
              border: "1px solid var(--border)",
              borderRadius: 10,
              background: "var(--surface)",
              overflow: "hidden",
            }}
          >
            {chases.map((c, i) => {
              const row = items.find((r) => r.id === c.tripId);
              if (!row || row.status === "received") return null;
              return (
                <div
                  key={c.tripId}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 12,
                    padding: "12px 16px",
                    borderTop: i === 0 ? "none" : "1px solid var(--border)",
                  }}
                >
                  <span
                    aria-hidden
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: "50%",
                      background: "#dc2626",
                      marginTop: 6,
                      flexShrink: 0,
                    }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>
                      {money(c.amount)} from {c.supplierName}
                      <span style={{ fontWeight: 400, color: "var(--text-muted)" }}>
                        {" "}
                        · {row.customer}
                        {row.destination ? `, ${row.destination}` : ""}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: "var(--text-subtle)", marginTop: 2 }}>
                      {c.reason}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                    {row.status !== "invoiced" && (
                      <button
                        onClick={() => void saveTrip(c.tripId, { commission_status: "invoiced" })}
                        style={smallBtn}
                      >
                        Invoiced
                      </button>
                    )}
                    <button
                      onClick={() => void saveTrip(c.tripId, { commission_status: "received" })}
                      style={{ ...smallBtn, borderColor: "var(--tg-primary)", color: "var(--tg-primary)" }}
                    >
                      Mark paid
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ─── Every booking ────────────────────────────────────── */}
      <section style={{ marginBottom: 26 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 10 }}>
          <h2 style={{ fontSize: 13, fontWeight: 700, margin: 0 }}>
            {showAll ? "Every booking" : "Unpaid commission"}
          </h2>
          <button
            onClick={() => setShowAll((v) => !v)}
            style={{ ...smallBtn, border: "none", color: "var(--text-muted)" }}
          >
            {showAll ? `Show unpaid only (${unpaid.length})` : `Show all (${items.length})`}
          </button>
        </div>

        {visible.length === 0 ? (
          <div
            style={{
              border: "1px solid var(--border)",
              borderRadius: 10,
              background: "var(--surface)",
              padding: "26px 18px",
              textAlign: "center",
              fontSize: 13,
              color: "var(--text-muted)",
            }}
          >
            {items.length === 0
              ? "No bookings yet. Commission appears here once a trip reaches Booked."
              : "Every booking has been paid."}
          </div>
        ) : (
          <div style={{ overflowX: "auto", border: "1px solid var(--border)", borderRadius: 10, background: "var(--surface)" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 940 }}>
              <thead>
                <tr>
                  {["Booking", "Value", "Supplier", "Rate %", "Amount", "Status", "Due", "Earns"].map((h) => (
                    <th
                      key={h}
                      style={{
                        textAlign: "left",
                        padding: "9px 10px",
                        fontSize: 10.5,
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                        color: "var(--text-subtle)",
                        fontWeight: 600,
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => (
                  <tr key={row.id} style={{ opacity: saving === row.id ? 0.55 : 1 }}>
                    <td style={cell}>
                      <Link
                        href={`/customers/${row.householdId}`}
                        style={{ color: "var(--text)", textDecoration: "none", fontWeight: 600 }}
                      >
                        {row.customer}
                      </Link>
                      <div style={{ fontSize: 11.5, color: "var(--text-subtle)" }}>
                        {row.destination ?? "—"}
                        {row.departDate ? ` · ${row.departDate.slice(0, 10)}` : ""}
                      </div>
                    </td>

                    <td style={{ ...cell, whiteSpace: "nowrap" }}>
                      {row.totalValue == null ? (
                        <span style={{ color: "var(--text-subtle)" }}>No price</span>
                      ) : (
                        money(row.totalValue)
                      )}
                    </td>

                    <td style={cell}>
                      <select
                        value={row.supplierId ?? ""}
                        onChange={(e) =>
                          void saveTrip(row.id, { supplier_id: e.target.value || null })
                        }
                        style={{ ...input, border: "1px solid var(--border)" }}
                      >
                        <option value="">Not set</option>
                        {supplierList.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </td>

                    <td style={{ ...cell, width: 82 }}>
                      <NumberCell
                        value={row.rate}
                        placeholder="—"
                        onSave={(v) => void saveTrip(row.id, { commission_rate: v })}
                      />
                    </td>

                    <td style={{ ...cell, width: 100 }}>
                      <NumberCell
                        value={row.amount}
                        placeholder="—"
                        onSave={(v) => void saveTrip(row.id, { commission_amount: v })}
                      />
                    </td>

                    <td style={cell}>
                      <select
                        value={row.status}
                        onChange={(e) => void saveTrip(row.id, { commission_status: e.target.value })}
                        style={{ ...input, border: "1px solid var(--border)" }}
                      >
                        {(Object.keys(STATUS_LABEL) as CommissionRow["status"][]).map((s) => (
                          <option key={s} value={s}>
                            {STATUS_LABEL[s]}
                          </option>
                        ))}
                      </select>
                    </td>

                    <td style={{ ...cell, whiteSpace: "nowrap" }}>
                      <div
                        style={{
                          fontSize: 12,
                          color:
                            row.ageingState === "overdue"
                              ? "#dc2626"
                              : row.ageingState === "unknown"
                                ? "var(--text-subtle)"
                                : "var(--text-muted)",
                        }}
                        title={row.dueReason}
                      >
                        {row.ageingLabel}
                      </div>
                    </td>

                    <td style={cell}>
                      {row.computed == null ? (
                        <span style={{ color: "#b45309", fontSize: 12 }} title={row.computedReason}>
                          Not recorded
                        </span>
                      ) : (
                        <>
                          <div style={{ fontWeight: 600 }}>{money(row.computed)}</div>
                          <div
                            style={{ fontSize: 11, color: "var(--text-subtle)", lineHeight: 1.4 }}
                            title={row.computedReason}
                          >
                            {row.computedFrom === "supplier_rate"
                              ? `${nameOf(row.supplierId)}'s usual rate`
                              : row.computedFrom === "trip_rate"
                                ? "From the rate here"
                                : "Entered by hand"}
                          </div>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {supplierList.length > 0 && !addingSupplier && (
          <button onClick={() => setAddingSupplier(true)} style={{ ...smallBtn, marginTop: 8 }}>
            + Add a supplier
          </button>
        )}
        {addingSupplier && (
          <div style={{ display: "flex", gap: 6, marginTop: 8, alignItems: "center" }}>
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void addSupplier(); }}
              placeholder="Supplier name, e.g. Jet2 Holidays"
              style={{
                flex: 1,
                maxWidth: 280,
                border: "1px solid var(--border)",
                borderRadius: 7,
                background: "var(--surface)",
                color: "var(--text)",
                padding: "6px 9px",
                fontSize: 12.5,
                fontFamily: "inherit",
              }}
            />
            <button
              onClick={() => void addSupplier()}
              disabled={newName.trim().length < 2}
              style={{ ...smallBtn, color: "var(--tg-accent-dark)", borderColor: "var(--tg-accent)", opacity: newName.trim().length < 2 ? 0.6 : 1 }}
            >
              Add
            </button>
            <button onClick={() => { setAddingSupplier(false); setNewName(""); }} style={{ ...smallBtn, border: "none" }}>
              Cancel
            </button>
            <span style={{ fontSize: 11, color: "var(--text-subtle)" }}>Set its rate and terms once it&apos;s in the list.</span>
          </div>
        )}
      </section>

      {/* ─── Suppliers ────────────────────────────────────────── */}
      <section>
        <h2 style={{ fontSize: 13, fontWeight: 700, margin: "0 0 4px" }}>Suppliers</h2>
        <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "0 0 10px", lineHeight: 1.5 }}>
          Your usual rate and how long each one takes to pay. A booking with no rate of its own
          falls back to these, labelled as the supplier&apos;s usual rate rather than a confirmed
          one. Leave either blank and nothing will be assumed.
        </p>
        {supplierList.length === 0 && !addingSupplier ? (
          <div
            style={{
              border: "1px solid var(--border)",
              borderRadius: 10,
              background: "var(--surface)",
              padding: "22px 18px",
              fontSize: 13,
              color: "var(--text-muted)",
              textAlign: "center",
            }}
          >
            No suppliers yet.{" "}
            <button
              onClick={() => setAddingSupplier(true)}
              style={{ ...smallBtn, display: "inline-flex", marginLeft: 4 }}
            >
              Add your first supplier
            </button>
          </div>
        ) : (
          <div style={{ border: "1px solid var(--border)", borderRadius: 10, background: "var(--surface)", overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 520 }}>
              <thead>
                <tr>
                  {["Supplier", "Usual rate %", "Pays after (days)"].map((h) => (
                    <th
                      key={h}
                      style={{
                        textAlign: "left",
                        padding: "9px 10px",
                        fontSize: 10.5,
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                        color: "var(--text-subtle)",
                        fontWeight: 600,
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {supplierList.map((s) => (
                  <tr key={s.id}>
                    <td style={cell}>
                      <div style={{ fontWeight: 600 }}>{s.name}</div>
                      {s.category && (
                        <div style={{ fontSize: 11.5, color: "var(--text-subtle)" }}>{s.category}</div>
                      )}
                    </td>
                    <td style={{ ...cell, width: 140 }}>
                      <NumberCell
                        value={s.default_commission_rate}
                        placeholder="Not set"
                        onSave={(v) => void saveSupplier(s.id, { default_commission_rate: v })}
                      />
                    </td>
                    <td style={{ ...cell, width: 160 }}>
                      <NumberCell
                        value={s.payment_terms_days}
                        placeholder="Not set"
                        onSave={(v) => void saveSupplier(s.id, { payment_terms_days: v })}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

/** A number you can clear. Blank means "not recorded", which is a real state. */
function NumberCell({
  value,
  placeholder,
  onSave,
}: {
  value: number | null;
  placeholder: string;
  onSave: (value: number | null) => void;
}) {
  const [draft, setDraft] = useState(value == null ? "" : String(value));

  return (
    <input
      value={draft}
      placeholder={placeholder}
      inputMode="decimal"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        const trimmed = draft.trim();
        const next = trimmed === "" ? null : Number(trimmed.replace(/[£,\s]/g, ""));
        if (next !== null && !Number.isFinite(next)) {
          setDraft(value == null ? "" : String(value));
          return;
        }
        if (next !== value) onSave(next);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
      style={{ ...input, border: "1px solid var(--border)" }}
    />
  );
}

function Figure({
  label,
  value,
  note,
  strong,
  danger,
  muted,
}: {
  label: string;
  value: string;
  note: string;
  strong?: boolean;
  danger?: boolean;
  muted?: boolean;
}) {
  return (
    <div style={{ minWidth: 130 }}>
      <div
        style={{
          fontSize: 10.5,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          color: "var(--text-subtle)",
          fontWeight: 600,
          marginBottom: 3,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: strong ? 26 : 22,
          fontWeight: 700,
          letterSpacing: "-0.02em",
          lineHeight: 1.1,
          color: danger ? "#dc2626" : muted ? "var(--text-muted)" : "var(--text)",
        }}
      >
        {value}
      </div>
      <div style={{ fontSize: 11.5, color: "var(--text-subtle)", marginTop: 2 }}>{note}</div>
    </div>
  );
}

const smallBtn: React.CSSProperties = {
  border: "1px solid var(--border)",
  background: "var(--surface)",
  color: "var(--text)",
  borderRadius: 6,
  padding: "4px 9px",
  fontSize: 11.5,
  fontFamily: "inherit",
  cursor: "pointer",
};
