/**
 * What a customer may change about themselves, and the rules for it.
 *
 * Deliberately narrow. Phone, dietary needs and the household address are
 * things the traveller knows better than their agent and that change often.
 * Name, date of birth and passport details are NOT here: they must match
 * travel documents, and a booking already made on the old spelling is the
 * agent's problem to unpick — so those stay a conversation.
 *
 * Phone and dietary reuse the CRM's own validateContact, so the portal and
 * the agent's form cannot drift apart on what is acceptable. The address is
 * validated here because it lives on the household.
 *
 * Pure; no I/O.
 */

import { validateContact } from "@/lib/contacts/validate";

export type SelfServiceAddress = {
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  county: string | null;
  postcode: string | null;
};

export type SelfServicePatch = {
  /** Fields on the signed-in traveller's own contact row. */
  contact: { phone?: string | null; dietary?: string | null };
  /** Fields on the household (shared with everyone in it). */
  household: Partial<SelfServiceAddress>;
  /** Which fields the customer touched, for the timeline. Values are NOT recorded. */
  changed: string[];
};

export type SelfServiceResult =
  | { ok: true; patch: SelfServicePatch }
  | { ok: false; error: string };

const ADDRESS_FIELDS = ["address_line1", "address_line2", "city", "county", "postcode"] as const;

/** Generous limits: a real address line can be long, a postcode never is. */
const LIMITS: Record<(typeof ADDRESS_FIELDS)[number], number> = {
  address_line1: 120,
  address_line2: 120,
  city: 80,
  county: 80,
  postcode: 12,
};

const LABELS: Record<string, string> = {
  phone: "phone number",
  dietary: "dietary needs",
  address_line1: "address",
  address_line2: "address",
  city: "address",
  county: "address",
  postcode: "address",
};

export function validateSelfService(input: Record<string, unknown>): SelfServiceResult {
  const patch: SelfServicePatch = { contact: {}, household: {}, changed: [] };

  // ─── Phone and dietary: the CRM's own rules ───────────────────────────
  const contactInput: Record<string, unknown> = {};
  if ("phone" in input) contactInput.phone = input.phone;
  if ("dietary" in input) contactInput.dietary = input.dietary;
  if (Object.keys(contactInput).length > 0) {
    const validated = validateContact(contactInput, false);
    if (!validated.ok) return { ok: false, error: validated.error };
    if ("phone" in validated.patch) patch.contact.phone = validated.patch.phone ?? null;
    if ("dietary" in validated.patch) patch.contact.dietary = validated.patch.dietary ?? null;
  }

  // ─── Address: household-level ─────────────────────────────────────────
  for (const field of ADDRESS_FIELDS) {
    if (!(field in input)) continue;
    const raw = input[field];
    if (raw !== null && typeof raw !== "string") {
      return { ok: false, error: "That address doesn't look right." };
    }
    const value = (raw ?? "").trim();
    if (value.length > LIMITS[field]) {
      return { ok: false, error: `That ${field === "postcode" ? "postcode" : "address"} is too long.` };
    }
    patch.household[field] = value || null;
  }

  const touched = [...Object.keys(patch.contact), ...Object.keys(patch.household)];
  if (touched.length === 0) return { ok: false, error: "Nothing to change." };

  // One "address" entry however many address lines moved.
  patch.changed = Array.from(new Set(touched.map((f) => LABELS[f] ?? f)));
  return { ok: true, patch };
}
