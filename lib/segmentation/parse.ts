/**
 * Smart-segmentation NL parser.
 *
 * Takes a plain-English query and returns a list of "tokens" — structured
 * filters with a label (for the chip UI) and a SQL-like predicate spec.
 *
 * For day 2 this is rules-based. Day 5 swaps the implementation for a Claude
 * API call that returns the same Token[] shape — so the UI doesn't change.
 */

export type TokenType =
  | "destination"
  | "time"
  | "household"
  | "value"
  | "status"
  | "location";

export type Token = {
  type: TokenType;
  label: string;
  icon: "plane" | "clock" | "users" | "sparkles" | "home";
  /** Used by the server-side filter to narrow the SQL query. */
  filter: TokenFilter;
};

export type TokenFilter =
  | { kind: "destination"; match: string }
  | { kind: "no_contact_months"; months: number }
  | { kind: "booked_in_last_months"; months: number }
  | { kind: "booked_year"; year: number }
  | { kind: "household_type"; value: "family" | "couple" | "solo" | "group" }
  | { kind: "ltv_min"; amount: number }
  | { kind: "trip_stage"; value: string }
  | { kind: "city"; match: string };

export function parseQueryToTokens(q: string): Token[] {
  const lower = q.toLowerCase();
  const tokens: Token[] = [];

  // ─── Destinations ────────────────────────────────────────────────
  const destinations = [
    "greece", "crete", "santorini", "mykonos", "rhodes", "kos", "corfu",
    "italy", "tuscany", "sardinia", "sicily", "lake garda", "lake como", "sorrento",
    "spain", "mallorca", "tenerife", "lanzarote", "costa brava", "costa del sol",
    "portugal", "algarve", "madeira", "cape verde",
    "maldives", "dubai", "iceland", "japan", "croatia", "vietnam",
    "morocco", "marrakech", "turkey", "antalya", "istanbul",
    "cyprus", "bali", "ghana", "jordan", "patagonia", "antarctica",
    "tulum", "mexico", "costa rica", "florida", "canada", "norway",
    "faroe islands", "france", "paris", "mauritius", "argentina",
  ];
  for (const d of destinations) {
    if (lower.includes(d)) {
      tokens.push({
        type: "destination",
        label: d.replace(/\b\w/g, (c) => c.toUpperCase()),
        icon: "plane",
        filter: { kind: "destination", match: d },
      });
      break;
    }
  }

  // ─── Time periods ────────────────────────────────────────────────
  const yearMatch = lower.match(/\b(202[0-6])\b/);
  if (yearMatch) {
    tokens.push({
      type: "time",
      label: `Booked ${yearMatch[1]}`,
      icon: "clock",
      filter: { kind: "booked_year", year: parseInt(yearMatch[1], 10) },
    });
  }

  if (
    /no contact|haven'?t.*book|gone quiet|silent|dormant|inactive|haven'?t heard|not.*recent/i.test(
      q
    )
  ) {
    tokens.push({
      type: "time",
      label: "No contact 12+ months",
      icon: "clock",
      filter: { kind: "no_contact_months", months: 12 },
    });
  }

  const lastMonthsMatch = q.match(/last (\d+) (?:month|mo)/i);
  if (lastMonthsMatch) {
    const m = parseInt(lastMonthsMatch[1], 10);
    tokens.push({
      type: "time",
      label: `Booked last ${m} months`,
      icon: "clock",
      filter: { kind: "booked_in_last_months", months: m },
    });
  }

  // ─── Household types ────────────────────────────────────────────
  if (/famil/i.test(q)) {
    tokens.push({
      type: "household",
      label: "Family",
      icon: "users",
      filter: { kind: "household_type", value: "family" },
    });
  } else if (/couple/i.test(q)) {
    tokens.push({
      type: "household",
      label: "Couples",
      icon: "users",
      filter: { kind: "household_type", value: "couple" },
    });
  } else if (/solo|single travell?er/i.test(q)) {
    tokens.push({
      type: "household",
      label: "Solo travellers",
      icon: "users",
      filter: { kind: "household_type", value: "solo" },
    });
  }

  // ─── Children proxy → family ────────────────────────────────────
  if (/kids|child/i.test(q) && !tokens.find((t) => t.type === "household")) {
    tokens.push({
      type: "household",
      label: "Has children",
      icon: "users",
      filter: { kind: "household_type", value: "family" },
    });
  }

  // ─── Value bands ────────────────────────────────────────────────
  const valueMatch = q.match(/(?:over|above|more than|>)\s*£?(\d+)\s*k?/i);
  if (valueMatch) {
    let v = parseInt(valueMatch[1], 10);
    if (q.toLowerCase().includes("k") || v < 1000) v *= 1000;
    tokens.push({
      type: "value",
      label: `LTV > £${v.toLocaleString("en-GB")}`,
      icon: "sparkles",
      filter: { kind: "ltv_min", amount: v },
    });
  } else if (/high.value|high.lt[vc]|vip|big spender/i.test(q)) {
    tokens.push({
      type: "value",
      label: "High value (>£25k)",
      icon: "sparkles",
      filter: { kind: "ltv_min", amount: 25000 },
    });
  }

  // ─── Statuses ───────────────────────────────────────────────────
  if (/travel(?:ling)? now|currently away|on holiday|in destination/i.test(q)) {
    tokens.push({
      type: "status",
      label: "Travelling now",
      icon: "plane",
      filter: { kind: "trip_stage", value: "travelling" },
    });
  } else if (/pre.?departure|departing soon|leaving soon/i.test(q)) {
    tokens.push({
      type: "status",
      label: "Pre-departure",
      icon: "plane",
      filter: { kind: "trip_stage", value: "pre_departure" },
    });
  } else if (/enquir/i.test(q)) {
    tokens.push({
      type: "status",
      label: "Enquiry stage",
      icon: "plane",
      filter: { kind: "trip_stage", value: "enquiry" },
    });
  } else if (/return(?:ed|ing)/i.test(q)) {
    tokens.push({
      type: "status",
      label: "Recently returned",
      icon: "plane",
      filter: { kind: "trip_stage", value: "returned" },
    });
  }

  // ─── Locations ──────────────────────────────────────────────────
  const cities = [
    "bournemouth", "poole", "southampton", "christchurch", "salisbury",
    "wimborne", "lymington", "wareham", "ringwood", "verwood", "new forest",
  ];
  for (const ct of cities) {
    if (lower.includes(ct)) {
      tokens.push({
        type: "location",
        label: ct.replace(/\b\w/g, (c) => c.toUpperCase()),
        icon: "home",
        filter: { kind: "city", match: ct },
      });
      break;
    }
  }

  return tokens;
}

// ─── Saved (canned) segments ────────────────────────────────────────────
export type SavedSegment = {
  id: string;
  label: string;
  tokens: Token[];
};

export const SAVED_SEGMENTS: SavedSegment[] = [
  {
    id: "greece-quiet",
    label: "Past Greece bookers, no contact 12+ mo",
    tokens: [
      {
        type: "destination",
        label: "Greece",
        icon: "plane",
        filter: { kind: "destination", match: "greece" },
      },
      {
        type: "time",
        label: "No contact 12+ months",
        icon: "clock",
        filter: { kind: "no_contact_months", months: 12 },
      },
    ],
  },
  {
    id: "pre-dep-kids",
    label: "Pre-departure with kids",
    tokens: [
      {
        type: "status",
        label: "Pre-departure",
        icon: "plane",
        filter: { kind: "trip_stage", value: "pre_departure" },
      },
      {
        type: "household",
        label: "Has children",
        icon: "users",
        filter: { kind: "household_type", value: "family" },
      },
    ],
  },
  {
    id: "high-ltv-couples",
    label: "High-LTV couples",
    tokens: [
      {
        type: "value",
        label: "LTV > £20,000",
        icon: "sparkles",
        filter: { kind: "ltv_min", amount: 20000 },
      },
      {
        type: "household",
        label: "Couples",
        icon: "users",
        filter: { kind: "household_type", value: "couple" },
      },
    ],
  },
  {
    id: "travelling-now",
    label: "Travelling right now",
    tokens: [
      {
        type: "status",
        label: "Travelling",
        icon: "plane",
        filter: { kind: "trip_stage", value: "travelling" },
      },
    ],
  },
];
