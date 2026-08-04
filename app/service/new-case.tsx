"use client";

/**
 * New case — topbar button + modal on /service. Pick the customer, optionally
 * the trip it concerns, the type and what happened. Priority and the SLA are
 * computed server-side from the real travel context and shown back after
 * saving — the agent never guesses urgency.
 */

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PlusIcon, XIcon } from "@/components/ui/icons";
import { CASE_TYPES, CASE_TYPE_LABELS, type CaseType } from "@/lib/cases/priority";
import { CustomerCombobox } from "@/components/customer-combobox";

const field: React.CSSProperties = {
  width: "100%",
  border: "1px solid var(--border)",
  borderRadius: 7,
  background: "var(--surface)",
  color: "var(--text)",
  padding: "7px 10px",
  fontSize: 13,
  fontFamily: "inherit",
};

const label: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: "var(--text-muted)",
  display: "block",
  marginBottom: 3,
};

export function NewCase({
  households,
  trips,
}: {
  households: { id: string; label: string }[];
  trips: { id: string; household_id: string; label: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const [householdId, setHouseholdId] = useState("");
  const [tripId, setTripId] = useState("");
  const [caseType, setCaseType] = useState<CaseType>("general_enquiry");
  const [subject, setSubject] = useState("");
  const [detail, setDetail] = useState("");

  const householdTrips = useMemo(
    () => trips.filter((t) => t.household_id === householdId),
    [trips, householdId]
  );

  function reset() {
    setHouseholdId("");
    setTripId("");
    setCaseType("general_enquiry");
    setSubject("");
    setDetail("");
    setError(null);
    setDone(null);
  }

  async function save() {
    setError(null);
    setSaving(true);
    try {
      const res = await fetch("/api/cases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          household_id: householdId || null,
          trip_id: tripId || null,
          case_type: caseType,
          subject,
          detail: detail || null,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        priority?: number;
        priority_reason?: string;
        sla_hours?: number;
      };
      if (!res.ok || !data.ok) throw new Error(data.error || `Failed (${res.status})`);
      setDone(
        `Opened at P${data.priority} (${data.sla_hours}h target). ${data.priority_reason ?? ""}`
      );
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't open the case");
    } finally {
      setSaving(false);
    }
  }

  const disabled = saving || !subject.trim();

  return (
    <>
      <button
        onClick={() => { setOpen(true); reset(); }}
        style={{
          background: "var(--tg-primary)",
          border: "1px solid var(--tg-primary)",
          borderRadius: 6,
          padding: "6px 10px",
          color: "white",
          fontSize: 12.5,
          fontWeight: 500,
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          cursor: "pointer",
        }}
      >
        <PlusIcon width={14} height={14} />
        New case
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="New case"
          onClick={() => setOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 120,
            background: "rgba(2, 6, 23, 0.5)",
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "center",
            padding: "10vh 16px 16px",
            overflowY: "auto",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 460,
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 14,
              boxShadow: "var(--shadow-lg)",
              padding: 20,
              animation: "fadeUp 0.18s ease-out",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "var(--text)" }}>New case</h2>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close"
                style={{ background: "transparent", border: "1px solid var(--border)", borderRadius: 6, width: 26, height: 26, color: "var(--text-muted)", display: "inline-flex", alignItems: "center", justifyContent: "center" }}
              >
                <XIcon width={13} height={13} />
              </button>
            </div>

            {done ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ fontSize: 13, color: "var(--text)", lineHeight: 1.6 }}>{done}</div>
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                  <button
                    onClick={() => { reset(); }}
                    style={{ background: "transparent", border: "1px solid var(--border)", borderRadius: 7, padding: "7px 13px", fontSize: 13, color: "var(--text-muted)", cursor: "pointer" }}
                  >
                    Open another
                  </button>
                  <button
                    onClick={() => setOpen(false)}
                    style={{ background: "var(--tg-primary)", border: "none", borderRadius: 7, padding: "7px 15px", fontSize: 13, fontWeight: 600, color: "white", cursor: "pointer" }}
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div>
                  <span style={label}>Customer</span>
                  <CustomerCombobox
                    customers={households.map((h) => ({ id: h.id, name: h.label }))}
                    value={householdId}
                    onChange={(id) => { setHouseholdId(id); setTripId(""); }}
                    placeholder="Search customers, or leave blank for internal…"
                  />
                </div>
                {householdId && householdTrips.length > 0 && (
                  <div>
                    <span style={label}>About which trip? (drives the priority)</span>
                    <select style={field} value={tripId} onChange={(e) => setTripId(e.target.value)}>
                      <option value="">Not trip specific</option>
                      {householdTrips.map((t) => (
                        <option key={t.id} value={t.id}>{t.label}</option>
                      ))}
                    </select>
                  </div>
                )}
                <div>
                  <span style={label}>Type</span>
                  <select style={field} value={caseType} onChange={(e) => setCaseType(e.target.value as CaseType)}>
                    {CASE_TYPES.map((t) => (
                      <option key={t} value={t}>{CASE_TYPE_LABELS[t]}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <span style={label}>Subject *</span>
                  <input style={field} value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. Hotel room not as booked" />
                </div>
                <div>
                  <span style={label}>What happened</span>
                  <textarea
                    style={{ ...field, resize: "vertical", lineHeight: 1.5 }}
                    rows={3}
                    value={detail}
                    onChange={(e) => setDetail(e.target.value)}
                    placeholder="What the customer reported, in their words where possible"
                  />
                </div>

                {error && <div style={{ fontSize: 12, color: "var(--error)" }}>{error}</div>}

                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
                  <button
                    onClick={() => setOpen(false)}
                    style={{ background: "transparent", border: "1px solid var(--border)", borderRadius: 7, padding: "7px 13px", fontSize: 13, color: "var(--text-muted)", cursor: "pointer" }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={save}
                    disabled={disabled}
                    style={{
                      background: "var(--tg-primary)",
                      border: "none",
                      borderRadius: 7,
                      padding: "7px 15px",
                      fontSize: 13,
                      fontWeight: 600,
                      color: "white",
                      cursor: disabled ? "default" : "pointer",
                      opacity: disabled ? 0.6 : 1,
                    }}
                  >
                    {saving ? "Opening…" : "Open case"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
