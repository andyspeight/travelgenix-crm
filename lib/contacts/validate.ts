/**
 * A traveller's editable details — validated before they touch the database.
 *
 * The usability review found the CRM could READ a passport expiry, a date of
 * birth, dietary needs and flags everywhere and WRITE them nowhere. Every
 * passport feature ran on a field only the demo seed could fill. This is the
 * write path that fixes it.
 *
 * WHAT IS NOT HERE, on purpose: the full passport NUMBER. The column exists
 * and is marked "encrypted in phase 2"; a passport number is the one field
 * here that must never sit in the database in the clear, and the encryption
 * (lib/crypto/field) is not yet wired to a key. Expiry is what the checks
 * actually use and is not sensitive in the same way, so it goes in now and
 * the number waits for its key. Storing it plainly to look complete would be
 * the exact mistake this review exists to catch.
 *
 * Pure functions, no I/O.
 */

export type ContactRole = "lead" | "partner" | "child" | "dependant" | "other";

export const ROLES: { id: ContactRole; label: string }[] = [
  { id: "lead", label: "Lead" },
  { id: "partner", label: "Partner" },
  { id: "child", label: "Child" },
  { id: "dependant", label: "Dependant" },
  { id: "other", label: "Other" },
];

/** Flags an agent legitimately raises against a traveller. */
export const FLAGS: { id: string; label: string }[] = [
  { id: "allergy", label: "Allergy" },
  { id: "mobility", label: "Mobility" },
  { id: "medical", label: "Medical" },
  { id: "unaccompanied_minor", label: "Unaccompanied minor" },
  { id: "vip", label: "VIP" },
];

export type ContactPatch = {
  first_name?: string;
  last_name?: string | null;
  role?: ContactRole;
  email?: string | null;
  phone?: string | null;
  date_of_birth?: string | null;
  passport_expiry?: string | null;
  passport_country?: string | null;
  dietary?: string | null;
  flags?: string[];
};

export type ValidateResult =
  | { ok: true; patch: ContactPatch }
  | { ok: false; error: string };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ROLE_SET = new Set<ContactRole>(["lead", "partner", "child", "dependant", "other"]);
const FLAG_SET = new Set(FLAGS.map((f) => f.id));

/** A real date in a known shape, or a reason it is not one. Empty = cleared. */
function coerceDate(value: unknown, label: string): { value: string | null } | { error: string } {
  if (value === null || value === undefined || value === "") return { value: null };
  if (typeof value !== "string" || !DATE_RE.test(value)) {
    return { error: `${label} needs to be a date (YYYY-MM-DD).` };
  }
  const d = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return { error: `${label} isn't a real date.` };
  return { value };
}

/**
 * Turn whatever the form sent into the fields we will write, or refuse it.
 *
 * Only keys the form actually included are validated and returned, so the
 * caller can PATCH exactly what changed and leave everything else alone.
 * `isNew` requires a first name (you cannot add a nameless traveller); an
 * edit may leave it untouched.
 */
export function validateContact(input: Record<string, unknown>, isNew = false): ValidateResult {
  const patch: ContactPatch = {};

  if (isNew || "first_name" in input) {
    const first = typeof input.first_name === "string" ? input.first_name.trim() : "";
    if (first.length < 1) return { ok: false, error: "A traveller needs a first name." };
    if (first.length > 80) return { ok: false, error: "That first name is too long." };
    patch.first_name = first;
  }

  if ("last_name" in input) {
    const last = typeof input.last_name === "string" ? input.last_name.trim() : "";
    patch.last_name = last ? last.slice(0, 80) : null;
  }

  if (isNew || "role" in input) {
    const role = input.role as ContactRole;
    patch.role = ROLE_SET.has(role) ? role : "other";
  }

  if ("email" in input) {
    const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
    if (email && !EMAIL_RE.test(email)) return { ok: false, error: "That email address doesn't look right." };
    patch.email = email || null;
  }

  if ("phone" in input) {
    const phone = typeof input.phone === "string" ? input.phone.trim() : "";
    // Deliberately permissive: international formats, spaces, brackets. We are
    // storing what the agent was given, not enforcing a dialling plan.
    patch.phone = phone ? phone.slice(0, 40) : null;
  }

  for (const field of ["date_of_birth", "passport_expiry"] as const) {
    if (field in input) {
      const label = field === "date_of_birth" ? "Date of birth" : "Passport expiry";
      const result = coerceDate(input[field], label);
      if ("error" in result) return { ok: false, error: result.error };
      patch[field] = result.value;
    }
  }

  if ("passport_country" in input) {
    const country = typeof input.passport_country === "string" ? input.passport_country.trim() : "";
    patch.passport_country = country ? country.slice(0, 60) : null;
  }

  if ("dietary" in input) {
    const dietary = typeof input.dietary === "string" ? input.dietary.trim() : "";
    patch.dietary = dietary ? dietary.slice(0, 200) : null;
  }

  if ("flags" in input) {
    const raw = Array.isArray(input.flags) ? input.flags : [];
    // Only flags we know — an unknown flag is dropped, never stored, so the
    // set of possible flags stays a question the app can answer.
    patch.flags = Array.from(
      new Set(raw.filter((f): f is string => typeof f === "string" && FLAG_SET.has(f)))
    );
  }

  return { ok: true, patch };
}
