/**
 * Field-level encryption for the few values that warrant it.
 *
 * WHAT THIS IS FOR. Supabase already encrypts the disk, so this is not about
 * the disk. It protects against the database CONTENTS leaking while the
 * platform behaves perfectly: a stolen service-role key, a copied backup, an
 * over-broad support query. In those cases everything else in the row is
 * readable and these fields are not.
 *
 * WHAT IS ENCRYPTED, AND WHY SO LITTLE. A passport number is a strong identity
 * document — the single most abusable field a travel agency holds, and one
 * nothing in this product computes on, so encrypting it costs nothing.
 *
 * Passport EXPIRY is deliberately left in the clear. It drives the passport
 * risk score, the compliance roll-ups, the Suggest feed and the
 * passport_expiring journey trigger — all of which compare and sort across
 * every contact. Encrypting it would break each of those to hide a date that
 * is far less abusable than the number. Encrypting everything until the
 * product stops working is not security, it is theatre with casualties.
 *
 * AES-256-GCM: authenticated, so tampering is detected rather than silently
 * decrypted into something else. Matches the widget suite's approach, so the
 * estate has one pattern rather than two.
 *
 * Stored as `v1:<iv>:<tag>:<ciphertext>`, all base64. The version prefix means
 * a future scheme can be introduced without guessing at old rows, and the
 * marker makes an encrypted value obvious in a dump rather than looking like
 * corrupted text.
 */

import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const PREFIX = "v1";
const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12; // 96 bits, the GCM standard

/** True when a key is configured and encryption will actually happen. */
export function fieldCryptoConfigured(): boolean {
  return Boolean(process.env.LUNA_FIELD_KEY);
}

function key(): Buffer {
  const raw = process.env.LUNA_FIELD_KEY ?? "";
  const buf = Buffer.from(raw, "hex");
  if (buf.length !== 32) {
    throw new Error(
      "LUNA_FIELD_KEY must be 64 hex characters (32 bytes) for AES-256."
    );
  }
  return buf;
}

/** Is this value already encrypted? Cheap, and safe on null. */
export function isEncrypted(value: string | null | undefined): boolean {
  return typeof value === "string" && value.startsWith(`${PREFIX}:`);
}

/**
 * Encrypt a value for storage. Returns null for null/empty so an absent
 * passport stays absent rather than becoming ciphertext of "".
 *
 * Already-encrypted input is returned untouched, so re-saving a record cannot
 * double-encrypt it into something unreadable.
 */
export function encryptField(value: string | null | undefined): string | null {
  if (value == null || value === "") return null;
  if (isEncrypted(value)) return value;
  if (!fieldCryptoConfigured()) {
    // No key: store as-is rather than pretending. The caller surfaces this
    // through fieldCryptoConfigured(); silently "encrypting" with no key
    // would be the worst of both worlds.
    return value;
  }

  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    PREFIX,
    iv.toString("base64"),
    tag.toString("base64"),
    ciphertext.toString("base64"),
  ].join(":");
}

/**
 * Decrypt a stored value. Plaintext passes through unchanged, so rows written
 * before a key existed still read correctly.
 *
 * Returns null when the value cannot be decrypted — a wrong key, a truncated
 * value, or tampering. Deliberately null rather than throwing: a passport
 * number we cannot read must show as absent, not take down the customer page.
 */
export function decryptField(value: string | null | undefined): string | null {
  if (value == null || value === "") return null;
  if (!isEncrypted(value)) return value;

  try {
    const [, ivB64, tagB64, dataB64] = value.split(":");
    if (!ivB64 || !tagB64 || !dataB64) return null;

    const decipher = createDecipheriv(ALGORITHM, key(), Buffer.from(ivB64, "base64"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(dataB64, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return null;
  }
}

/**
 * What to show an agent who is not editing: the last four characters, the
 * rest masked. Enough to confirm you are looking at the right document
 * without putting the number on screen for anyone passing the desk.
 */
export function maskPassport(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (trimmed.length <= 4) return "•".repeat(trimmed.length);
  return "•".repeat(trimmed.length - 4) + trimmed.slice(-4);
}
