"use client";

/**
 * Address fields with Ideal Postcodes' AddressFinder — shared by the
 * add-customer and edit-details forms.
 *
 * The lookup runs IN THE BROWSER, on purpose. Ideal Postcodes keys are locked
 * to a set of allowed URLs, and only a real browser request carries the page's
 * origin for that check to pass — a server-side call has no origin and is
 * refused (code 4011). So AddressFinder attaches to the search box below,
 * autocompletes as the person types, and hands us the chosen address through a
 * callback, which we push into the form's controlled fields. The fields stay
 * editable, and if no key is configured the search box simply isn't shown and
 * everything is typed by hand.
 *
 * The key is a PUBLIC, domain-restricted key exposed as
 * NEXT_PUBLIC_IDEAL_POSTCODES_KEY — safe in the browser precisely because it
 * only works from the agency's own whitelisted domains.
 */

import { useEffect, useRef, useState } from "react";
import { titleCase } from "@/lib/address/postcode";

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

const KEY = process.env.NEXT_PUBLIC_IDEAL_POSTCODES_KEY;

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

  const searchRef = useRef<HTMLInputElement>(null);
  // Keep the latest onChange without re-running the (expensive) setup effect.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const valueRef = useRef(value);
  valueRef.current = value;

  const [finderState, setFinderState] = useState<"idle" | "ready" | "unavailable">("idle");

  useEffect(() => {
    if (!KEY || !searchRef.current) return;

    let cancelled = false;
    let controller: { detach: () => unknown } | undefined;

    // Loaded lazily so the library (which touches `window`) never runs during
    // server rendering, and its weight lands in its own client chunk.
    import("@ideal-postcodes/address-finder")
      .then(({ AddressFinder }) => {
        if (cancelled || !searchRef.current) return;
        controller = AddressFinder.setup({
          apiKey: KEY as string,
          inputField: searchRef.current,
          // UK addresses only: hides the country switcher and keeps it simple.
          restrictCountries: ["GBR"],
          // We drive our own React fields from the callback, so tell the
          // library not to hunt for and write into form inputs itself.
          outputFields: {},
          onAddressRetrieved(address) {
            const a = address as Record<string, string | undefined>;
            const line2 = [a.line_2, a.line_3].map((s) => (s ?? "").trim()).filter(Boolean).join(", ");
            const county =
              a.county || a.traditional_county || a.administrative_county || a.postal_county || "";
            onChangeRef.current({
              ...valueRef.current,
              address_line1: (a.line_1 ?? "").trim(),
              address_line2: line2,
              city: (a.post_town ?? "").trim(),
              county: titleCase(county),
              postcode: (a.postcode ?? "").trim(),
            });
          },
          // Fired when the key can't be used (bad key, limit, wrong domain).
          onFailedCheck() {
            if (!cancelled) setFinderState("unavailable");
          },
        });
        if (!cancelled) setFinderState("ready");
      })
      .catch(() => {
        if (!cancelled) setFinderState("unavailable");
      });

    return () => {
      cancelled = true;
      try {
        controller?.detach();
      } catch {
        /* already gone */
      }
    };
    // Set up once; live values are read through the refs above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = (patch: Partial<AddressValue>) => onChange({ ...value, ...patch });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {KEY && (
        <div>
          <span style={label}>Find address</span>
          <input
            ref={searchRef}
            style={input}
            placeholder="Start typing a postcode or address…"
            autoComplete="off"
            aria-label="Search for an address"
          />
          <div style={{ fontSize: 11.5, color: "var(--text-subtle)", marginTop: 4 }}>
            {finderState === "unavailable"
              ? "Address search is unavailable right now — enter the address below."
              : "Search and pick an address, or type it in below."}
          </div>
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
      <div>
        <span style={label}>Postcode</span>
        <input
          style={{ ...input, maxWidth: 180 }}
          value={value.postcode}
          onChange={(e) => set({ postcode: e.target.value })}
          placeholder="e.g. LS1 4DY"
          autoComplete="postal-code"
        />
      </div>
    </div>
  );
}
