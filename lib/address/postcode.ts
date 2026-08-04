/**
 * Address helpers — the pure bits.
 *
 * The lookup itself now runs in the browser (Ideal Postcodes' AddressFinder,
 * wired up in components/address-fields.tsx), so there's no provider JSON to
 * parse here any more. What's left is display: turning the stored fields into
 * one line, and tidying PAF's SHOUTING county names.
 */

/** Title-case a value ("WEST YORKSHIRE" → "West Yorkshire"). */
export function titleCase(v: string | null | undefined): string {
  return (v ?? "")
    .trim()
    .toLowerCase()
    .replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

/** One-line address for display, skipping the parts that aren't set. */
export function formatAddress(parts: {
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  county?: string | null;
  postcode?: string | null;
}): string {
  return [parts.address_line1, parts.address_line2, parts.city, parts.county, parts.postcode]
    .map((p) => (p ?? "").trim())
    .filter(Boolean)
    .join(", ");
}
