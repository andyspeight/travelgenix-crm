"use client";

/**
 * Add customer — the topbar button on /customers plus its modal form. Creates
 * a household + lead contact via POST /api/customers and opens the new record.
 * The minimum is a customer name and a lead first name; the rest can be added
 * on the record later.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PlusIcon, XIcon } from "@/components/ui/icons";
import { AddressFields, emptyAddress, type AddressValue } from "@/components/address-fields";

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

export function AddCustomer() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [displayName, setDisplayName] = useState("");
  const [householdType, setHouseholdType] = useState("");
  const [address, setAddress] = useState<AddressValue>(emptyAddress);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  async function save() {
    setError(null);
    setSaving(true);
    try {
      const res = await fetch("/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          display_name: displayName,
          household_type: householdType || null,
          address_line1: address.address_line1 || null,
          address_line2: address.address_line2 || null,
          city: address.city || null,
          county: address.county || null,
          postcode: address.postcode || null,
          lead: { first_name: firstName, last_name: lastName || null, email: email || null, phone: phone || null },
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; id?: string; error?: string };
      if (!res.ok || !data.ok || !data.id) throw new Error(data.error || `Failed (${res.status})`);
      setOpen(false);
      router.push(`/customers/${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create the customer");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button
        onClick={() => { setOpen(true); setError(null); }}
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
        Add customer
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Add customer"
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
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 420,
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 14,
              boxShadow: "var(--shadow-lg)",
              padding: 20,
              animation: "fadeUp 0.18s ease-out",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "var(--text)" }}>Add customer</h2>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close"
                style={{ background: "transparent", border: "1px solid var(--border)", borderRadius: 6, width: 26, height: 26, color: "var(--text-muted)", display: "inline-flex", alignItems: "center", justifyContent: "center" }}
              >
                <XIcon width={13} height={13} />
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div>
                <span style={label}>Customer / household name *</span>
                <input style={field} value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="e.g. Sarah & James Thompson" autoFocus />
              </div>
              <div>
                <span style={label}>Type</span>
                <select style={field} value={householdType} onChange={(e) => setHouseholdType(e.target.value)}>
                  <option value="">—</option>
                  <option value="family">Family</option>
                  <option value="couple">Couple</option>
                  <option value="solo">Solo</option>
                  <option value="group">Group</option>
                </select>
              </div>

              <div style={{ borderTop: "1px solid var(--border)", paddingTop: 10, fontSize: 11, fontWeight: 600, color: "var(--text-subtle)", letterSpacing: "0.05em", textTransform: "uppercase" }}>
                Address <span style={{ opacity: 0.7, textTransform: "none", letterSpacing: 0 }}>· optional</span>
              </div>
              <AddressFields value={address} onChange={setAddress} />

              <div style={{ borderTop: "1px solid var(--border)", paddingTop: 10, fontSize: 11, fontWeight: 600, color: "var(--text-subtle)", letterSpacing: "0.05em", textTransform: "uppercase" }}>
                Lead contact
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <span style={label}>First name *</span>
                  <input style={field} value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Sarah" />
                </div>
                <div>
                  <span style={label}>Last name</span>
                  <input style={field} value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Thompson" />
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <span style={label}>Email</span>
                  <input style={field} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="sarah@example.com" />
                </div>
                <div>
                  <span style={label}>Phone</span>
                  <input style={field} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="07700 900123" />
                </div>
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
                  disabled={saving || !displayName.trim() || !firstName.trim()}
                  style={{
                    background: "var(--tg-primary)",
                    border: "none",
                    borderRadius: 7,
                    padding: "7px 15px",
                    fontSize: 13,
                    fontWeight: 600,
                    color: "white",
                    cursor: saving || !displayName.trim() || !firstName.trim() ? "default" : "pointer",
                    opacity: saving || !displayName.trim() || !firstName.trim() ? 0.6 : 1,
                  }}
                >
                  {saving ? "Creating…" : "Create customer"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
