"use client";

/**
 * Household details editor. A small "Edit details" control in the header card
 * opens a compact form for the descriptive fields an agent legitimately edits:
 * display name, household type, city. PATCHes /api/customers/[id]/household.
 *
 * Deliberately does NOT expose derived fields (lifetime value, trips booked,
 * customer since) — those come from bookings, not hand-editing — nor any
 * compliance/passport data.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AddressFields, type AddressValue } from "@/components/address-fields";

const TYPES = [
  { key: "solo", label: "Solo" },
  { key: "couple", label: "Couple" },
  { key: "family", label: "Family" },
  { key: "group", label: "Group" },
  { key: "other", label: "Other" },
];

export function HouseholdEditButton({
  householdId,
  displayName,
  householdType,
  addressLine1,
  addressLine2,
  city,
  county,
  postcode,
}: {
  householdId: string;
  displayName: string;
  householdType: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  county: string | null;
  postcode: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(displayName);
  const [type, setType] = useState(householdType ?? "solo");
  const [address, setAddress] = useState<AddressValue>({
    address_line1: addressLine1 ?? "",
    address_line2: addressLine2 ?? "",
    city: city ?? "",
    county: county ?? "",
    postcode: postcode ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!name.trim()) {
      setError("Name can't be empty");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/customers/${householdId}/household`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          display_name: name.trim(),
          household_type: type,
          address_line1: address.address_line1.trim(),
          address_line2: address.address_line2.trim(),
          city: address.city.trim(),
          county: address.county.trim(),
          postcode: address.postcode.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.error || "Couldn't save");
      setOpen(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save");
    } finally {
      setBusy(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    fontSize: 13,
    padding: "7px 9px",
    border: "1px solid var(--border)",
    borderRadius: 6,
    background: "var(--surface)",
    color: "var(--text)",
    width: "100%",
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 600,
    color: "var(--text-subtle)",
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    marginBottom: 4,
    display: "block",
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          background: "none",
          border: "1px solid var(--border)",
          borderRadius: 6,
          padding: "5px 10px",
          fontSize: 12,
          fontWeight: 500,
          color: "var(--text-muted)",
          cursor: "pointer",
          flexShrink: 0,
        }}
      >
        Edit details
      </button>
    );
  }

  return (
    <>
      {/* backdrop */}
      <div
        onClick={() => setOpen(false)}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.32)",
          zIndex: 1000,
        }}
      />
      {/* modal */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Edit customer details"
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: "min(420px, 92vw)",
          background: "var(--surface)",
          border: "1px solid var(--border-strong)",
          borderRadius: 14,
          boxShadow: "var(--shadow-lg)",
          zIndex: 1001,
          padding: 20,
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text)", marginBottom: 16 }}>
          Edit details
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={labelStyle}>Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={inputStyle}
              autoFocus
            />
          </div>

          <div>
            <label style={labelStyle}>Type</label>
            <select value={type} onChange={(e) => setType(e.target.value)} style={inputStyle}>
              {TYPES.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          <AddressFields
            value={address}
            onChange={setAddress}
            inputStyle={inputStyle}
            labelStyle={labelStyle}
          />
        </div>

        {error && (
          <div style={{ fontSize: 12, color: "var(--error)", marginTop: 12 }}>{error}</div>
        )}

        <div style={{ display: "flex", gap: 8, marginTop: 20, justifyContent: "flex-end" }}>
          <button
            onClick={() => {
              setOpen(false);
              setError(null);
            }}
            style={{
              background: "none",
              border: "1px solid var(--border)",
              borderRadius: 6,
              padding: "7px 14px",
              fontSize: 13,
              color: "var(--text-muted)",
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={busy}
            style={{
              background: "var(--tg-primary)",
              border: "1px solid var(--tg-primary)",
              borderRadius: 6,
              padding: "7px 16px",
              fontSize: 13,
              fontWeight: 500,
              color: "white",
              cursor: busy ? "wait" : "pointer",
              opacity: busy ? 0.7 : 1,
            }}
          >
            {busy ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
    </>
  );
}
