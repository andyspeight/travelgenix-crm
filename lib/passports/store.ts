/**
 * Storing and revealing a passport number.
 *
 * The only path in or out of contacts.passport_number. Three rules it exists
 * to hold:
 *
 *   1. NOTHING IS STORED IN THE CLEAR. Encryption happens here, bound to the
 *      agency and contact (lib/crypto/field). With no key configured the write
 *      is refused, never downgraded.
 *   2. THE NUMBER IS NEVER RETURNED BY ACCIDENT. No list, no customer page, no
 *      export reads it. A reveal is a deliberate, separate call.
 *   3. EVERY ACCESS IS RECORDED BEFORE IT HAPPENS. The audit row is written
 *      first, so a read cannot occur without a trace of it — if the audit
 *      write fails, the reveal is refused.
 *
 * "Who looked at this passport, and when" is the question a data-protection
 * audit actually asks, and this is what answers it.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  decryptField,
  encryptField,
  fieldCryptoConfigured,
  isEncrypted,
  maskPassport,
  type FieldContext,
} from "@/lib/crypto/field";

const FIELD = "passport_number";

/** A passport number: letters and digits, as issued. Punctuation is not. */
const NUMBER_RE = /^[A-Z0-9]{5,20}$/;

export type PassportActor = {
  /** The Control identity acting. Null in single-tenant mode. */
  email: string | null;
  ip: string | null;
};

export type PassportResult =
  | { ok: true; value: string; masked: string }
  | { ok: false; error: string; reason: "not_configured" | "not_found" | "absent" | "unreadable" | "audit" };

export type PassportWriteResult =
  | { ok: true; onFile: boolean }
  | { ok: false; error: string; reason: "not_configured" | "invalid" | "not_found" | "failed" };

function context(agencyId: string, contactId: string): FieldContext {
  return { agencyId, recordId: contactId, field: FIELD };
}

/**
 * Record an access attempt. Returns false when the record could not be
 * written — callers treat that as a refusal, never as "carry on quietly".
 */
async function audit(
  supabase: SupabaseClient,
  args: { agencyId: string; contactId: string; action: "reveal" | "set" | "clear"; actor: PassportActor }
): Promise<boolean> {
  const { error } = await supabase.from("passport_access").insert({
    agency_id: args.agencyId,
    contact_id: args.contactId,
    actor_email: args.actor.email,
    action: args.action,
    ip: args.actor.ip,
  });
  if (error) {
    // Deliberately no value, no number, nothing identifying beyond the ids.
    console.error("[passport] audit write failed:", error.message);
    return false;
  }
  return true;
}

/** Is a number on file? The safe question — no key needed, nothing decrypted. */
export async function passportOnFile(
  supabase: SupabaseClient,
  agencyId: string,
  contactId: string
): Promise<boolean> {
  const { data } = await supabase
    .from("contacts")
    .select("passport_number")
    .eq("agency_id", agencyId)
    .eq("id", contactId)
    .maybeSingle();
  return Boolean(data?.passport_number);
}

/**
 * Store (or replace) a passport number. Audited as 'set'.
 *
 * The value is normalised to upper case with spaces stripped, the way it is
 * printed in the document, so the same passport does not end up stored two
 * different ways.
 */
export async function setPassportNumber(
  supabase: SupabaseClient,
  args: { agencyId: string; contactId: string; value: string; actor: PassportActor }
): Promise<PassportWriteResult> {
  if (!fieldCryptoConfigured()) {
    return {
      ok: false,
      reason: "not_configured",
      error:
        "Passport numbers cannot be stored until the encryption key (LUNA_FIELD_KEY) is set. Nothing has been saved.",
    };
  }

  const value = args.value.replace(/\s+/g, "").toUpperCase();
  if (!NUMBER_RE.test(value)) {
    return {
      ok: false,
      reason: "invalid",
      error: "A passport number is 5 to 20 letters and numbers, with no punctuation.",
    };
  }

  let sealed: string | null;
  try {
    sealed = encryptField(value, context(args.agencyId, args.contactId));
  } catch {
    // The message is the module's, but it names an environment variable —
    // keep the caller's version generic.
    return {
      ok: false,
      reason: "not_configured",
      error: "Passport numbers cannot be stored securely right now. Nothing has been saved.",
    };
  }
  if (!sealed || !isEncrypted(sealed)) {
    return { ok: false, reason: "failed", error: "That didn't save." };
  }

  if (!(await audit(supabase, { ...args, action: "set" }))) {
    return {
      ok: false,
      reason: "failed",
      error: "That didn't save: the access record could not be written.",
    };
  }

  const { data, error } = await supabase
    .from("contacts")
    .update({ passport_number: sealed, updated_at: new Date().toISOString() })
    .eq("agency_id", args.agencyId)
    .eq("id", args.contactId)
    .select("id")
    .maybeSingle();
  if (error) {
    console.error("[passport] store failed:", error.message);
    return { ok: false, reason: "failed", error: "That didn't save." };
  }
  if (!data) return { ok: false, reason: "not_found", error: "Traveller not found." };
  return { ok: true, onFile: true };
}

/** Remove a passport number. Audited as 'clear'. */
export async function clearPassportNumber(
  supabase: SupabaseClient,
  args: { agencyId: string; contactId: string; actor: PassportActor }
): Promise<PassportWriteResult> {
  if (!(await audit(supabase, { ...args, action: "clear" }))) {
    return {
      ok: false,
      reason: "failed",
      error: "That didn't save: the access record could not be written.",
    };
  }
  const { data, error } = await supabase
    .from("contacts")
    .update({ passport_number: null, updated_at: new Date().toISOString() })
    .eq("agency_id", args.agencyId)
    .eq("id", args.contactId)
    .select("id")
    .maybeSingle();
  if (error) {
    console.error("[passport] clear failed:", error.message);
    return { ok: false, reason: "failed", error: "That didn't save." };
  }
  if (!data) return { ok: false, reason: "not_found", error: "Traveller not found." };
  return { ok: true, onFile: false };
}

/**
 * Reveal a passport number. Audited as 'reveal' BEFORE the value is read, so
 * an access cannot happen without a record of it.
 */
export async function revealPassportNumber(
  supabase: SupabaseClient,
  args: { agencyId: string; contactId: string; actor: PassportActor }
): Promise<PassportResult> {
  const { data } = await supabase
    .from("contacts")
    .select("passport_number")
    .eq("agency_id", args.agencyId)
    .eq("id", args.contactId)
    .maybeSingle();
  if (!data) return { ok: false, reason: "not_found", error: "Traveller not found." };

  const stored = (data.passport_number as string | null) ?? null;
  if (!stored) {
    return { ok: false, reason: "absent", error: "No passport number on file." };
  }

  // Recorded first: a reveal that reached the value must leave a trace.
  if (!(await audit(supabase, { ...args, action: "reveal" }))) {
    return {
      ok: false,
      reason: "audit",
      error: "Can't show that right now: the access record could not be written.",
    };
  }

  const value = decryptField(stored, context(args.agencyId, args.contactId));
  if (value == null) {
    return {
      ok: false,
      reason: "unreadable",
      error:
        "That passport number can't be read with the current key. It may have been stored under a key that has since been rotated out.",
    };
  }
  return { ok: true, value, masked: maskPassport(value) ?? "" };
}
