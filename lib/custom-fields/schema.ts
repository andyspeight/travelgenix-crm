/**
 * Custom fields — the things this agency records that no other agency does.
 *
 * Every agency has three or four of them. A loyalty number. The wedding date.
 * A corporate account code. "Which of our two offices looks after them." They
 * are the difference between a CRM that fits and one everybody works around
 * in a spreadsheet, and no amount of travel-native thinking predicts them.
 *
 * HOW IT IS STORED, and why. Definitions live in their own table; values ride
 * along in a jsonb column on the record itself. That means every screen that
 * already loads a customer gets their custom fields for free — no join, no
 * second query, no page that renders half a record while it waits.
 *
 * THE RULES:
 *
 *   1. UNKNOWN KEYS ARE DROPPED, never stored. The moment a browser can put
 *      arbitrary json in that column, "what fields exist" stops being a
 *      question anyone can answer, and the data becomes a landfill.
 *
 *   2. A FIELD'S TYPE NEVER CHANGES. Turning a text field into a number would
 *      quietly reinterpret every value already in it — "approx 3" becomes
 *      nothing, and nobody finds out. Rename it, reorder it, add options to
 *      it; to change its type, make a new one.
 *
 *   3. FIELDS ARE ARCHIVED, NOT DELETED. Deleting the definition would orphan
 *      every value silently. Archiving hides it from the form and keeps what
 *      was recorded, labelled as no longer in use.
 *
 *   4. A VALUE THAT NO LONGER FITS IS SHOWN, NOT HIDDEN. Remove an option
 *      from a dropdown and the customers who had it still show it, marked. A
 *      CRM that silently blanks data an agency typed is worse than one that
 *      admits the option went away.
 *
 * Pure functions, no I/O.
 */

export type FieldType = "text" | "number" | "date" | "select" | "multi_select" | "checkbox";

/** Only the customer record for now — it is the one with a screen to put them on. */
export type FieldEntity = "household";

export type FieldDef = {
  id: string;
  entity: FieldEntity;
  /** Stable machine key. Derived from the label once, then never changed. */
  key: string;
  label: string;
  type: FieldType;
  /** For select / multi_select. Empty for everything else. */
  options: string[];
  /** Optional hint under the input. */
  help: string | null;
  position: number;
  archived: boolean;
};

export const FIELD_TYPES: { id: FieldType; label: string; hint: string }[] = [
  { id: "text", label: "Text", hint: "Anything: a reference, a note, a name" },
  { id: "number", label: "Number", hint: "Counts and amounts" },
  { id: "date", label: "Date", hint: "A day, e.g. a wedding or a renewal" },
  { id: "select", label: "Choose one", hint: "A fixed list, one answer" },
  { id: "multi_select", label: "Choose several", hint: "A fixed list, any number of answers" },
  { id: "checkbox", label: "Yes / no", hint: "A simple flag" },
];

export const MAX_FIELDS_PER_ENTITY = 25;
const MAX_TEXT = 500;
const MAX_OPTIONS = 40;

export type FieldValue = string | number | boolean | string[] | null;
export type CustomValues = Record<string, FieldValue>;

/**
 * A machine key from a human label. Made once, at creation, and then frozen —
 * renaming the label must never orphan the values stored under the old key.
 */
export function keyFrom(label: string): string {
  const key = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  // A key has to be something; a label of "!!!" would otherwise produce "".
  return key || "field";
}

export type DefInput = {
  label?: unknown;
  type?: unknown;
  options?: unknown;
  help?: unknown;
};

export type DefResult =
  | { ok: true; def: Omit<FieldDef, "id" | "position" | "archived" | "entity"> }
  | { ok: false; error: string };

/** Check a new field definition before it becomes a column everyone fills in. */
export function validateDef(input: DefInput, existingKeys: string[] = []): DefResult {
  const label = typeof input.label === "string" ? input.label.trim() : "";
  if (label.length < 2) return { ok: false, error: "Give the field a name." };
  if (label.length > 40) return { ok: false, error: "That name is too long — keep it to a few words." };

  const type = input.type as FieldType;
  if (!FIELD_TYPES.some((t) => t.id === type)) {
    return { ok: false, error: "Pick what kind of field it is." };
  }

  let options: string[] = [];
  if (type === "select" || type === "multi_select") {
    const raw = Array.isArray(input.options) ? input.options : [];
    options = Array.from(
      new Set(
        raw
          .filter((o): o is string => typeof o === "string")
          .map((o) => o.trim())
          .filter((o) => o.length > 0 && o.length <= 60)
      )
    ).slice(0, MAX_OPTIONS);
    if (options.length < 2) {
      return { ok: false, error: "A list needs at least two options." };
    }
  }

  const key = keyFrom(label);
  if (existingKeys.includes(key)) {
    return { ok: false, error: `You already have a field called "${label}".` };
  }

  const help = typeof input.help === "string" && input.help.trim() ? input.help.trim().slice(0, 120) : null;

  return { ok: true, def: { key, label, type, options, help } };
}

export type CoerceResult = { ok: true; value: FieldValue } | { ok: false; error: string };

/**
 * One value, checked against its own definition. Blank always means "not
 * recorded" — a number field left empty is null, never zero, because zero is
 * an answer and nobody gave one.
 */
export function coerceValue(def: FieldDef, raw: unknown): CoerceResult {
  if (raw === null || raw === undefined || raw === "") return { ok: true, value: null };

  switch (def.type) {
    case "text": {
      if (typeof raw !== "string") return { ok: false, error: `${def.label} must be text.` };
      const text = raw.trim();
      if (text.length > MAX_TEXT) {
        return { ok: false, error: `${def.label} is too long — ${MAX_TEXT} characters at most.` };
      }
      return { ok: true, value: text || null };
    }

    case "number": {
      const n = typeof raw === "number" ? raw : Number(String(raw).replace(/[£,\s]/g, ""));
      if (!Number.isFinite(n)) return { ok: false, error: `${def.label} must be a number.` };
      return { ok: true, value: Math.round(n * 100) / 100 };
    }

    case "date": {
      if (typeof raw !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
        return { ok: false, error: `${def.label} must be a date.` };
      }
      const d = new Date(`${raw}T00:00:00Z`);
      if (Number.isNaN(d.getTime())) return { ok: false, error: `${def.label} isn't a real date.` };
      return { ok: true, value: raw };
    }

    case "checkbox":
      return { ok: true, value: raw === true || raw === "true" };

    case "select": {
      if (typeof raw !== "string" || !def.options.includes(raw)) {
        return { ok: false, error: `"${String(raw)}" isn't one of the options for ${def.label}.` };
      }
      return { ok: true, value: raw };
    }

    case "multi_select": {
      if (!Array.isArray(raw)) return { ok: false, error: `${def.label} must be a list.` };
      const picked = raw.filter((x): x is string => typeof x === "string");
      const unknown = picked.find((p) => !def.options.includes(p));
      if (unknown) {
        return { ok: false, error: `"${unknown}" isn't one of the options for ${def.label}.` };
      }
      return { ok: true, value: picked.length ? Array.from(new Set(picked)) : null };
    }
  }
}

export type CleanResult = { values: CustomValues; errors: string[] };

/**
 * Everything a browser sent, reduced to what may be written.
 *
 * Unknown keys vanish without comment — the only client that sends them is
 * one that should not be trusted with a more helpful message. Archived fields
 * are refused for EDITING but their existing values are left untouched by the
 * caller, because they are still a record of something that was true.
 */
export function cleanValues(defs: FieldDef[], incoming: unknown): CleanResult {
  const values: CustomValues = {};
  const errors: string[] = [];

  if (!incoming || typeof incoming !== "object" || Array.isArray(incoming)) {
    return { values, errors: ["Those values are not in the expected format."] };
  }

  const byKey = new Map(defs.filter((d) => !d.archived).map((d) => [d.key, d]));

  for (const [key, raw] of Object.entries(incoming as Record<string, unknown>)) {
    const def = byKey.get(key);
    if (!def) continue; // unknown, or archived: not writable
    const coerced = coerceValue(def, raw);
    if (!coerced.ok) {
      errors.push(coerced.error);
      continue;
    }
    values[key] = coerced.value;
  }

  return { values, errors };
}

/** How a value reads on the record. Null is "—", never a blank that looks broken. */
export function displayValue(def: FieldDef, value: FieldValue): string {
  if (value === null || value === undefined || value === "") return "—";

  switch (def.type) {
    case "checkbox":
      return value ? "Yes" : "No";
    case "date":
      return new Date(`${String(value)}T00:00:00Z`).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      });
    case "number":
      return typeof value === "number" ? value.toLocaleString("en-GB") : String(value);
    case "multi_select":
      return Array.isArray(value) ? value.map((v) => optionLabel(def, v)).join(", ") : String(value);
    case "select":
      return optionLabel(def, String(value));
    default:
      return String(value);
  }
}

/**
 * An option that has since been removed from the list still shows, marked.
 * Blanking data an agency typed because the dropdown changed is the kind of
 * quiet loss nobody notices until they need it.
 */
function optionLabel(def: FieldDef, value: string): string {
  return def.options.includes(value) ? value : `${value} (no longer an option)`;
}

/** Fields in the order they should appear: position, then name. */
export function sortDefs(defs: FieldDef[]): FieldDef[] {
  return [...defs].sort((a, b) => a.position - b.position || a.label.localeCompare(b.label));
}

/** Which archived fields still hold something for this record, so it can be shown. */
export function archivedWithValues(defs: FieldDef[], values: CustomValues): FieldDef[] {
  return sortDefs(
    defs.filter((d) => {
      if (!d.archived) return false;
      const v = values[d.key];
      return v !== null && v !== undefined && v !== "" && !(Array.isArray(v) && v.length === 0);
    })
  );
}
