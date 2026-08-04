/**
 * UK postcodes and address lookup — the pure core.
 *
 * Two jobs, no I/O:
 *   1. Tidy and sanity-check a postcode the way a person would expect
 *      ("sw1a1aa" becomes "SW1A 1AA"), so the same address is stored one way.
 *   2. Fold the two lookup providers into ONE shape the form consumes, so the
 *      component never has to know which one answered.
 *
 * Provider A (default, free, no key): postcodes.io — validates the postcode
 * and returns the area (town + county) but no street line. Provider B
 * (optional, keyed): getAddress.io — returns the full house-level list you
 * pick from. Both arrive here as raw JSON and leave as AddressSuggestion[].
 */

export type AddressSuggestion = {
  line1: string;
  line2: string;
  city: string;
  county: string;
  postcode: string;
};

// Permissive but junk-rejecting. Matches the shapes real UK postcodes take
// (A9 9AA, A99 9AA, AA9 9AA, AA99 9AA, A9A 9AA, AA9A 9AA) without pretending to
// be the full PAF validation — the lookup itself is the real test.
const UK_POSTCODE_RE = /^[A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2}$/i;

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/**
 * Canonical form: upper-cased, with the single space before the final three
 * characters (the inward code) that the Royal Mail format requires. Anything
 * too short to split is returned upper-cased and space-stripped, unchanged
 * otherwise, so partial typing isn't mangled mid-keystroke.
 */
export function normalisePostcode(raw: string): string {
  const cleaned = (raw ?? "").toUpperCase().replace(/\s+/g, "");
  if (cleaned.length < 5) return cleaned;
  return `${cleaned.slice(0, -3)} ${cleaned.slice(-3)}`;
}

export function isValidUkPostcode(raw: string): boolean {
  return UK_POSTCODE_RE.test((raw ?? "").trim());
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

/**
 * postcodes.io → a single area suggestion with no street line. admin_district
 * is the town/city for most of the UK; admin_county is often null in cities,
 * so region backfills the county rather than leaving it blank.
 */
export function parsePostcodesIo(json: unknown, fallbackPostcode: string): AddressSuggestion | null {
  const r = (json as { result?: Record<string, unknown> } | null)?.result;
  if (!r || typeof r !== "object") return null;
  const city = str(r.admin_district) || str(r.parish) || str(r.region);
  const region = str(r.region);
  const county = str(r.admin_county) || (region && region !== city ? region : "");
  return {
    line1: "",
    line2: "",
    city,
    county,
    postcode: str(r.postcode) || normalisePostcode(fallbackPostcode),
  };
}

type GetAddressEntry = {
  line_1?: unknown;
  line_2?: unknown;
  line_3?: unknown;
  line_4?: unknown;
  town_or_city?: unknown;
  county?: unknown;
};

/**
 * getAddress.io (find, expand=true) → the full list. line_1..line_4 hold the
 * street parts; the first non-empty is line 1 and the rest fold into line 2,
 * with town and county carried in their own fields.
 */
export function parseGetAddress(json: unknown, fallbackPostcode: string): AddressSuggestion[] {
  const payload = json as { postcode?: unknown; addresses?: unknown } | null;
  const arr = payload?.addresses;
  if (!Array.isArray(arr)) return [];
  const postcode = str(payload?.postcode) || normalisePostcode(fallbackPostcode);

  return arr.map((raw) => {
    const a = raw as GetAddressEntry;
    const lines = [a.line_1, a.line_2, a.line_3, a.line_4].map(str).filter(Boolean);
    return {
      line1: lines[0] ?? "",
      line2: lines.slice(1).join(", "),
      city: str(a.town_or_city),
      county: str(a.county),
      postcode,
    };
  });
}
