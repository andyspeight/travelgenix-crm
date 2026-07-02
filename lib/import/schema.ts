/**
 * Import mapping schema — the heart of "drop any CSV in and Luna maps it".
 *
 * Three responsibilities, all pure and unit-tested:
 *   1. TARGET_FIELDS — the catalogue of fields a column can map to. This one
 *      list drives the AI mapping prompt, the heuristic fallback and the
 *      override dropdowns in the UI, so they can never drift apart.
 *   2. heuristicMapping — a synonym-based header matcher used when the AI is
 *      unavailable (and as the base the AI corrects), so import always works.
 *   3. applyMapping — turns raw rows + a mapping into clean customer records
 *      with per-row issues. Handles the classic migration papercuts: a single
 *      "Full Name" column (split it), separate first/last (compose the
 *      household name), UK/ISO dates, "£12,500" money strings, and
 *      household-type synonyms ("married" → couple).
 *
 * One CSV row = one customer (a household plus its lead contact) — the shape
 * every mainstream CRM exports contacts in.
 */

export type TargetField =
  | "display_name"
  | "lead_full_name"
  | "lead_first_name"
  | "lead_last_name"
  | "lead_email"
  | "lead_phone"
  | "city"
  | "household_type"
  | "tags"
  | "notes"
  | "customer_since"
  | "lifetime_value"
  | "ignore";

export type ColumnMapping = { source: string; target: TargetField };

export type ImportedCustomer = {
  display_name: string;
  household_type: "family" | "couple" | "solo" | "group" | null;
  city: string | null;
  tags: string[];
  notes: string | null;
  customer_since: string | null; // ISO date
  lifetime_value: number | null;
  lead: {
    first_name: string;
    last_name: string | null;
    email: string | null;
    phone: string | null;
  };
};

export type RowIssue = { row: number; message: string };

export type ApplyResult = {
  customers: ImportedCustomer[];
  /** Rows that could not be imported at all (no usable name or email). */
  skipped: RowIssue[];
  /** Non-fatal problems on imported rows (bad email dropped, unparseable date). */
  warnings: RowIssue[];
};

// ─── 1. The field catalogue ─────────────────────────────────────────────────

export const TARGET_FIELDS: { key: TargetField; label: string; description: string }[] = [
  { key: "display_name", label: "Customer / household name", description: "The account, household or company name shown in the customer list, e.g. 'Sarah & James Thompson'." },
  { key: "lead_full_name", label: "Contact full name", description: "The main contact's full name in one column, e.g. 'Sarah Thompson'. Will be split into first and last name." },
  { key: "lead_first_name", label: "Contact first name", description: "The main contact's first / given name." },
  { key: "lead_last_name", label: "Contact last name", description: "The main contact's last / family name / surname." },
  { key: "lead_email", label: "Email", description: "The main contact's email address." },
  { key: "lead_phone", label: "Phone", description: "The main contact's phone or mobile number." },
  { key: "city", label: "City / town", description: "Where the customer lives, e.g. 'Poole'." },
  { key: "household_type", label: "Customer type", description: "Family, couple, solo or group (synonyms like 'married' or 'individual' are normalised)." },
  { key: "tags", label: "Tags", description: "Labels like 'VIP' or 'Repeat', separated by commas or semicolons." },
  { key: "notes", label: "Notes", description: "Free-text notes about the customer." },
  { key: "customer_since", label: "Customer since", description: "The date they became a customer (any common date format)." },
  { key: "lifetime_value", label: "Lifetime value", description: "Total spend to date, e.g. '£12,500' or '12500'." },
  { key: "ignore", label: "Don't import", description: "Skip this column entirely." },
];

const VALID_TARGETS = new Set<TargetField>(TARGET_FIELDS.map((f) => f.key));

export function isTargetField(v: unknown): v is TargetField {
  return typeof v === "string" && VALID_TARGETS.has(v as TargetField);
}

/** Drop mappings with unknown targets/sources; last mapping for a source wins. */
export function sanitizeMapping(raw: unknown, headers: string[]): ColumnMapping[] {
  if (!Array.isArray(raw)) return [];
  const bySource = new Map<string, TargetField>();
  for (const m of raw) {
    const source = (m as ColumnMapping)?.source;
    const target = (m as ColumnMapping)?.target;
    if (typeof source !== "string" || !headers.includes(source)) continue;
    if (!isTargetField(target)) continue;
    bySource.set(source, target);
  }
  return Array.from(bySource.entries()).map(([source, target]) => ({ source, target }));
}

// ─── 2. Heuristic header matcher ────────────────────────────────────────────
// Synonyms cover the exports of Capsule, HubSpot, Pipedrive, Monday and plain
// spreadsheets. First match wins; unknown headers map to "ignore" so nothing
// imports silently into the wrong field.

const SYNONYMS: [TargetField, RegExp][] = [
  ["lead_email", /^(e-?mail|email address|primary email|work email|contact email)$/i],
  ["lead_phone", /^(phone|mobile|telephone|tel|phone number|mobile number|cell|contact number)$/i],
  ["lead_first_name", /^(first ?name|forename|given name|fname)$/i],
  ["lead_last_name", /^(last ?name|surname|family name|lname|second name)$/i],
  ["lead_full_name", /^(full ?name|contact name|contact|name|person|client name|customer contact)$/i],
  ["display_name", /^(household|account|account name|company|company name|organisation|organization|customer|customer name|household name|display name|family)$/i],
  ["city", /^(city|town|location|place|home town|area)$/i],
  ["household_type", /^(type|customer type|household type|category|segment)$/i],
  ["tags", /^(tags?|labels?|groups?)$/i],
  ["notes", /^(notes?|comments?|description|about|background)$/i],
  ["customer_since", /^(customer since|client since|since|created|created at|date added|added|joined|start date|first booking)$/i],
  ["lifetime_value", /^(lifetime value|ltv|total spend|total value|revenue|value|spend|total sales)$/i],
];

export function heuristicMapping(headers: string[]): ColumnMapping[] {
  const used = new Set<TargetField>();
  return headers.map((h) => {
    const header = h.trim();
    for (const [target, re] of SYNONYMS) {
      // Tags and notes can plausibly repeat; single-value fields map once.
      if (re.test(header) && (!used.has(target) || target === "ignore")) {
        used.add(target);
        return { source: h, target };
      }
    }
    return { source: h, target: "ignore" as TargetField };
  });
}

// ─── 3. Apply a mapping to raw rows ─────────────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function splitFullName(full: string): { first: string; last: string | null } {
  const parts = full.trim().split(/\s+/);
  if (parts.length === 1) return { first: parts[0], last: null };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

export function normaliseHouseholdType(
  raw: string
): "family" | "couple" | "solo" | "group" | null {
  const v = raw.trim().toLowerCase();
  if (!v) return null;
  if (/famil|kids|children/.test(v)) return "family";
  if (/couple|married|partner|honeymoon|pair/.test(v)) return "couple";
  if (/solo|single|individual|one/.test(v)) return "solo";
  if (/group|corporate|team|club|party/.test(v)) return "group";
  return null;
}

/** Lenient date parse → ISO date. UK-first for ambiguous slashed dates. */
export function parseLenientDate(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;

  // ISO first: 2024-03-01 (optionally with time).
  const iso = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  // dd/mm/yyyy or dd-mm-yyyy (UK). If the first number can't be a day, treat
  // it as US mm/dd.
  const slashed = v.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (slashed) {
    let [, a, b, y] = slashed;
    let day = parseInt(a, 10);
    let month = parseInt(b, 10);
    if (month > 12 && day <= 12) [day, month] = [month, day]; // US order
    if (month > 12 || day > 31 || day < 1 || month < 1) return null;
    let year = parseInt(y, 10);
    if (y.length === 2) year += year >= 70 ? 1900 : 2000;
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  // Bare year: "2019" → start of year.
  const yearOnly = v.match(/^(19|20)\d{2}$/);
  if (yearOnly) return `${v}-01-01`;

  // Fall back to Date parsing for "12 Mar 2021" style.
  const d = new Date(v);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

/** "£12,500.50" / "$3k" / "12000" → number. */
export function parseMoney(raw: string): number | null {
  const v = raw.trim().toLowerCase();
  if (!v) return null;
  const kMatch = v.match(/^[^0-9]*([\d.,]+)\s*k$/);
  const cleaned = (kMatch ? kMatch[1] : v).replace(/[^0-9.]/g, "");
  if (!cleaned) return null;
  const n = parseFloat(cleaned);
  if (Number.isNaN(n) || n < 0) return null;
  return kMatch ? Math.round(n * 1000) : Math.round(n * 100) / 100;
}

export function applyMapping(
  headers: string[],
  rows: string[][],
  mapping: ColumnMapping[]
): ApplyResult {
  const targetByIndex = new Map<number, TargetField>();
  for (const m of mapping) {
    const idx = headers.indexOf(m.source);
    if (idx >= 0 && m.target !== "ignore") targetByIndex.set(idx, m.target);
  }

  const customers: ImportedCustomer[] = [];
  const skipped: RowIssue[] = [];
  const warnings: RowIssue[] = [];

  rows.forEach((row, i) => {
    const rowNo = i + 2; // 1-based + header row, matches what users see in Excel
    const get = (t: TargetField): string => {
      for (const [idx, target] of targetByIndex) {
        if (target === t) {
          const v = row[idx]?.trim() ?? "";
          if (v) return v;
        }
      }
      return "";
    };

    // ── Names: compose/split whatever combination the file has ─────────
    let first = get("lead_first_name");
    let last = get("lead_last_name");
    const full = get("lead_full_name");
    if (!first && full) {
      const s = splitFullName(full);
      first = s.first;
      last = last || s.last || "";
    }
    let displayName = get("display_name");
    if (!displayName) {
      displayName = full || [first, last].filter(Boolean).join(" ").trim();
    }
    if (!first && displayName) {
      first = splitFullName(displayName).first;
    }

    // ── Email (drop invalid with a warning rather than fail the row) ───
    let email: string | null = get("lead_email") || null;
    if (email && !EMAIL_RE.test(email)) {
      warnings.push({ row: rowNo, message: `Invalid email "${email}" left blank` });
      email = null;
    }

    // A row with no name at all and no email is unimportable.
    if (!displayName && !email) {
      skipped.push({ row: rowNo, message: "No name or email — nothing to identify the customer by" });
      return;
    }
    if (!displayName && email) displayName = email.split("@")[0];
    if (!first) first = splitFullName(displayName).first;

    // ── Optional fields, all forgiving ─────────────────────────────────
    const rawType = get("household_type");
    const householdType = rawType ? normaliseHouseholdType(rawType) : null;
    if (rawType && !householdType) {
      warnings.push({ row: rowNo, message: `Unrecognised customer type "${rawType}" left blank` });
    }

    const rawSince = get("customer_since");
    const customerSince = rawSince ? parseLenientDate(rawSince) : null;
    if (rawSince && !customerSince) {
      warnings.push({ row: rowNo, message: `Couldn't read date "${rawSince}" left blank` });
    }

    const rawValue = get("lifetime_value");
    const lifetimeValue = rawValue ? parseMoney(rawValue) : null;
    if (rawValue && lifetimeValue === null) {
      warnings.push({ row: rowNo, message: `Couldn't read value "${rawValue}" left blank` });
    }

    const tags = get("tags")
      .split(/[;,|]/)
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, 10);

    customers.push({
      display_name: displayName.slice(0, 120),
      household_type: householdType,
      city: get("city").slice(0, 80) || null,
      tags,
      notes: get("notes").slice(0, 2000) || null,
      customer_since: customerSince,
      lifetime_value: lifetimeValue,
      lead: {
        first_name: first.slice(0, 60),
        last_name: (last || null) && last.slice(0, 60),
        email,
        phone: get("lead_phone").slice(0, 40) || null,
      },
    });
  });

  return { customers, skipped, warnings };
}
