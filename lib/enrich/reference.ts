/**
 * Reference data for enquiry enrichment.
 *
 * Kept separate from the logic, and deliberately small, because this is the
 * part that GOES STALE. Everything here has an explicit validity window, and
 * the enrichment says nothing at all for dates outside it — a silent gap is
 * recoverable, a confidently wrong answer about someone's passport is not.
 *
 * None of this is advice. It exists so an agent is prompted to check the
 * right thing at the right moment, with the rule quoted so they can verify
 * it rather than take our word.
 */

export type Holiday = { name: string; from: string; to: string };

/**
 * English state-school holidays. Dates vary by local authority by a few days
 * — these are the common windows, which is enough to answer "is this peak?"
 * and never enough to answer "will this child be marked absent?".
 *
 * UPDATE ANNUALLY. Outside COVERED_YEARS the enrichment stays quiet.
 */
export const SCHOOL_HOLIDAYS: Holiday[] = [
  // 2026
  { name: "February half term", from: "2026-02-14", to: "2026-02-22" },
  { name: "the Easter holidays", from: "2026-03-28", to: "2026-04-12" },
  { name: "May half term", from: "2026-05-23", to: "2026-05-31" },
  { name: "the summer holidays", from: "2026-07-22", to: "2026-09-01" },
  { name: "October half term", from: "2026-10-24", to: "2026-11-01" },
  { name: "the Christmas holidays", from: "2026-12-19", to: "2027-01-03" },
  // 2027
  { name: "February half term", from: "2027-02-13", to: "2027-02-21" },
  { name: "the Easter holidays", from: "2027-03-27", to: "2027-04-11" },
  { name: "May half term", from: "2027-05-29", to: "2027-06-06" },
  { name: "the summer holidays", from: "2027-07-21", to: "2027-09-01" },
  { name: "October half term", from: "2027-10-23", to: "2027-10-31" },
  { name: "the Christmas holidays", from: "2027-12-18", to: "2028-01-02" },
];

/** Years the holiday table actually covers. Beyond these we say nothing. */
export const COVERED_YEARS = [2026, 2027];

export type PassportRule = {
  /** Months of validity required BEYOND the return date. */
  monthsBeyondReturn: number;
  /** The rule in words, for the agent to verify. */
  rule: string;
  /** True where the "issued within 10 years" condition also applies. */
  tenYearIssueRule?: boolean;
};

/** The Schengen area — one rule, many countries. */
const SCHENGEN = [
  "austria", "belgium", "croatia", "czechia", "czech republic", "denmark",
  "estonia", "finland", "france", "germany", "greece", "hungary", "iceland",
  "italy", "latvia", "liechtenstein", "lithuania", "luxembourg", "malta",
  "netherlands", "norway", "poland", "portugal", "slovakia", "slovenia",
  "spain", "sweden", "switzerland",
];

/**
 * Destinations where a UK passport commonly needs six months beyond the
 * return date. NOT exhaustive — the absence of a country here means "we hold
 * no rule", never "no rule applies", and the wording says so.
 */
const SIX_MONTH_RULE = [
  "thailand", "uae", "united arab emirates", "dubai", "abu dhabi", "egypt",
  "indonesia", "bali", "vietnam", "kenya", "tanzania", "zanzibar",
  "philippines", "malaysia", "singapore", "sri lanka", "maldives", "india",
  "china", "cambodia", "laos", "myanmar", "jordan", "qatar", "oman",
];

/**
 * Resolve a destination string to a passport rule, or null when we hold none.
 *
 * Matching is deliberately forgiving on the input (agents type "Crete", not
 * "Greece") but strict about only returning a rule we are confident in.
 */
export function passportRuleFor(destination: string | null): PassportRule | null {
  if (!destination) return null;
  const d = destination.toLowerCase().trim();

  // Common island / region names that resolve to a Schengen country.
  const SCHENGEN_PLACES = [
    "crete", "corfu", "rhodes", "santorini", "mykonos", "kos", "zante",
    "zakynthos", "kefalonia", "halkidiki", "athens", "majorca", "mallorca",
    "menorca", "ibiza", "tenerife", "lanzarote", "gran canaria",
    "fuerteventura", "costa del sol", "costa blanca", "algarve", "madeira",
    "sardinia", "sicily", "amalfi", "tuscany", "paris", "rome", "barcelona",
    "lisbon", "amsterdam", "prague", "vienna", "berlin",
  ];

  if (SCHENGEN.some((c) => d.includes(c)) || SCHENGEN_PLACES.some((p) => d.includes(p))) {
    return {
      monthsBeyondReturn: 3,
      tenYearIssueRule: true,
      rule:
        "Schengen rules: a UK passport must be issued less than 10 years before you enter, and valid for at least 3 months after you leave.",
    };
  }

  if (SIX_MONTH_RULE.some((c) => d.includes(c))) {
    return {
      monthsBeyondReturn: 6,
      rule: "This destination commonly requires six months' passport validity beyond the return date.",
    };
  }

  return null;
}
