"use client";

/**
 * Address fields with a postcode lookup — shared by the add-customer and
 * edit-details forms so the same tool works wherever an address is entered.
 *
 * A person types their postcode and presses Find. If the lookup returns a list
 * of real addresses (the keyed Ideal Postcodes provider), they pick theirs from
 * a dropdown and every field fills in. If only the area is known (the free
 * postcodes.io provider), the town and county fill in and they add the street
 * line themselves. Either way the fields stay fully editable — the lookup is a
 * shortcut, never a cage.
 *
 * Controlled: the parent owns the value and gets every change, so it saves the
 * address exactly like any other field on its form.
 */

import { useState } from "react";
import type { AddressSuggestion } from "@/lib/address/postcode";

export type AddressValue = {
  address_line1: string;
  address_line2: string;
  city: string;
  county: string;
  postcode: string;
};

export const emptyAddress: AddressValue = {
  address_line1: "",
  address_line2: "",
  city: "",
  county: "",
  postcode: "",
};

const baseInput: React.CSSProperties = {
  width: "100%",
  border: "1px solid var(--border)",
  borderRadius: 7,
  background: "var(--surface)",
  color: "var(--text)",
  padding: "7px 10px",
  fontSize: 13,
  fontFamily: "inherit",
};

const baseLabel: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: "var(--text-muted)",
  display: "block",
  marginBottom: 3,
};

export function AddressFields({
  value,
  onChange,
  inputStyle,
  labelStyle,
}: {
  value: AddressValue;
  onChange: (next: AddressValue) => void;
  inputStyle?: React.CSSProperties;
  labelStyle?: React.CSSProperties;
}) {
  const input = { ...baseInput, ...inputStyle };
  const label = { ...baseLabel, ...labelStyle };

  const [looking, setLooking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [options, setOptions] = useState<AddressSuggestion[] | null>(null);

  const set = (patch: Partial<AddressValue>) => onChange({ ...value, ...patch });

  async function find() {
    setError(null);
    setNote(null);
    setOptions(null);
    setLooking(true);
    try {
      const res = await fetch(`/api/address/lookup?postcode=${encodeURIComponent(value.postcode)}`);
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        postcode?: string;
        addresses?: AddressSuggestion[];
        partial?: boolean;
        error?: string;
      };
      if (!res.ok || !data.ok || !data.addresses?.length) {
        throw new Error(data.error || "We couldn't find that postcode. You can still type the address in.");
      }

      if (data.addresses.length > 1) {
        // The keyed provider returned the full list — let them pick.
        setOptions(data.addresses);
        setNote("Pick your address from the list.");
        if (data.postcode) set({ postcode: data.postcode });
        return;
      }

      // One result: apply it. A partial (area-only) result fills town/county
      // and leaves the street line for them.
      apply(data.addresses[0], data.postcode ?? value.postcode);
      if (data.partial) {
        setNote(`Found ${data.addresses[0].city || "the area"} — add your street address above.`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lookup failed.");
    } finally {
      setLooking(false);
    }
  }

  function apply(a: AddressSuggestion, postcode: string) {
    set({
      address_line1: a.line1 || value.address_line1,
      address_line2: a.line2 || value.address_line2,
      city: a.city || value.city,
      county: a.county || value.county,
      postcode: postcode || value.postcode,
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div>
        <span style={label}>Postcode</span>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            style={{ ...input, flex: 1 }}
            value={value.postcode}
            onChange={(e) => set({ postcode: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (value.postcode.trim() && !looking) void find();
              }
            }}
            placeholder="e.g. LS1 4DY"
            autoComplete="postal-code"
          />
          <button
            type="button"
            onClick={() => void find()}
            disabled={looking || !value.postcode.trim()}
            style={{
              flexShrink: 0,
              background: "var(--bg-subtle)",
              border: "1px solid var(--border)",
              borderRadius: 7,
              padding: "0 12px",
              fontSize: 12.5,
              fontWeight: 600,
              color: "var(--text)",
              cursor: looking || !value.postcode.trim() ? "default" : "pointer",
              opacity: looking || !value.postcode.trim() ? 0.6 : 1,
              whiteSpace: "nowrap",
            }}
          >
            {looking ? "Finding…" : "Find address"}
          </button>
        </div>
        {error && <div style={{ fontSize: 11.5, color: "var(--error)", marginTop: 4 }}>{error}</div>}
        {note && !error && <div style={{ fontSize: 11.5, color: "var(--text-subtle)", marginTop: 4 }}>{note}</div>}
      </div>

      {options && (
        <div>
          <span style={label}>Choose your address</span>
          <select
            style={input}
            defaultValue=""
            onChange={(e) => {
              const i = Number(e.target.value);
              if (Number.isInteger(i) && options[i]) {
                apply(options[i], value.postcode);
                setOptions(null);
                setNote(null);
              }
            }}
          >
            <option value="" disabled>
              {options.length} addresses found…
            </option>
            {options.map((a, i) => (
              <option key={i} value={i}>
                {[a.line1, a.line2].filter(Boolean).join(", ")}
              </option>
            ))}
          </select>
        </div>
      )}

      <div>
        <span style={label}>Address line 1</span>
        <input
          style={input}
          value={value.address_line1}
          onChange={(e) => set({ address_line1: e.target.value })}
          placeholder="House / flat and street"
          autoComplete="address-line1"
        />
      </div>
      <div>
        <span style={label}>Address line 2</span>
        <input
          style={input}
          value={value.address_line2}
          onChange={(e) => set({ address_line2: e.target.value })}
          placeholder="Optional"
          autoComplete="address-line2"
        />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div>
          <span style={label}>Town / city</span>
          <input
            style={input}
            value={value.city}
            onChange={(e) => set({ city: e.target.value })}
            placeholder="e.g. Leeds"
            autoComplete="address-level2"
          />
        </div>
        <div>
          <span style={label}>County</span>
          <input
            style={input}
            value={value.county}
            onChange={(e) => set({ county: e.target.value })}
            placeholder="Optional"
            autoComplete="address-level1"
          />
        </div>
      </div>
    </div>
  );
}
