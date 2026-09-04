/**
 * Field-level encryption for the few values that warrant it.
 *
 * WHAT THIS IS FOR. Supabase already encrypts the disk, so this is not about
 * the disk. It protects against the database CONTENTS leaking while the
 * platform behaves perfectly: a stolen service-role key, a copied backup, an
 * over-broad support query. In those cases everything else in the row is
 * readable and these fields are not — the key lives only in the application's
 * environment, never in the database.
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
 * THE SCHEME. AES-256-GCM: authenticated, so tampering is detected rather
 * than silently decrypted into something else.
 *
 *   v2:<keyId>:<iv>:<tag>:<ciphertext>      (all base64 except keyId)
 *
 * Three things the format buys, each answering a specific attack:
 *
 *   BOUND TO ITS ROW. Every value is encrypted with Additional Authenticated
 *   Data naming the agency, the record and the field it belongs to. A
 *   ciphertext lifted from one contact and pasted onto another — the move
 *   available to anyone who reaches the database with write access but no key
 *   — fails to decrypt. Without AAD it would decrypt perfectly and hand the
 *   attacker one traveller's passport number under another's name.
 *
 *   NAMED KEY. The key id is the first 8 hex of the key's SHA-256: it says
 *   WHICH key sealed a value without revealing the key. Rotation becomes
 *   possible without a big-bang re-encryption — the retiring key stays
 *   readable through LUNA_FIELD_KEY_OLD while new writes use the new one.
 *
 *   VERSIONED. A future scheme can be introduced without guessing at old
 *   rows, and the marker makes an encrypted value obvious in a dump rather
 *   than looking like corrupted text.
 *
 * FAIL CLOSED. With no key configured, encryption THROWS. An earlier draft
 * stored the value as-is rather than "pretending" — but the consequence of a
 * misconfigured deploy was passport numbers written to the database in the
 * clear, which is the one outcome this module exists to prevent. Refusing the
 * write keeps both principles: nothing pretends, and nothing leaks.
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "crypto";

const VERSION = "v2";
const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12; // 96 bits, the GCM standard
const KEY_BYTES = 32; // AES-256
const KEY_ID_CHARS = 8;

/**
 * What a value is bound to. Two values with different contexts are not
 * interchangeable, so ciphertext cannot be moved between rows or tenants.
 */
export type FieldContext = {
  agencyId: string;
  recordId: string;
  field: string;
};

export class FieldCryptoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FieldCryptoError";
  }
}

function parseKey(raw: string | undefined, name: string): Buffer | null {
  const value = (raw ?? "").trim();
  if (!value) return null;
  if (!/^[0-9a-fA-F]{64}$/.test(value)) {
    throw new FieldCryptoError(`${name} must be 64 hex characters (32 bytes) for AES-256.`);
  }
  const buf = Buffer.from(value, "hex");
  if (buf.length !== KEY_BYTES) {
    throw new FieldCryptoError(`${name} must be 64 hex characters (32 bytes) for AES-256.`);
  }
  return buf;
}

function keyId(key: Buffer): string {
  return createHash("sha256").update(key).digest("hex").slice(0, KEY_ID_CHARS);
}

/** The key new values are sealed with, or null when none is configured. */
function primaryKey(): Buffer | null {
  return parseKey(process.env.LUNA_FIELD_KEY, "LUNA_FIELD_KEY");
}

/**
 * Every key a stored value might have been sealed with: the current one, plus
 * the retiring one during a rotation. Decrypt tries them; encrypt never does.
 */
function keyring(): Buffer[] {
  const keys: Buffer[] = [];
  const primary = primaryKey();
  if (primary) keys.push(primary);
  const old = parseKey(process.env.LUNA_FIELD_KEY_OLD, "LUNA_FIELD_KEY_OLD");
  // A rotation that forgets to change the key is a configuration mistake, not
  // two keys — keep the ring honest so keyFor() cannot report a false match.
  if (old && !(primary && old.length === primary.length && timingSafeEqual(old, primary))) {
    keys.push(old);
  }
  return keys;
}

/** True when a key is configured and encryption will actually happen. */
export function fieldCryptoConfigured(): boolean {
  try {
    return primaryKey() !== null;
  } catch {
    // A malformed key is not a configured one. The write path throws with the
    // real reason; a status check must not.
    return false;
  }
}

/** The id of the key currently sealing new values, for diagnostics. */
export function activeKeyId(): string | null {
  const key = primaryKey();
  return key ? keyId(key) : null;
}

/** Is this value already encrypted? Cheap, and safe on null. */
export function isEncrypted(value: string | null | undefined): boolean {
  return typeof value === "string" && /^v[0-9]+:/.test(value);
}

/** The AAD that binds a value to its row. Order and separator are part of the format. */
function aad(context: FieldContext): Buffer {
  return Buffer.from(`${context.agencyId}|${context.recordId}|${context.field}`, "utf8");
}

/**
 * Encrypt a value for storage, bound to the row it belongs to.
 *
 * Returns null for null/empty so an absent passport stays absent rather than
 * becoming ciphertext of "". Already-encrypted input is returned untouched,
 * so re-saving a record cannot double-encrypt it into something unreadable.
 *
 * THROWS when no key is configured: see FAIL CLOSED above. Callers check
 * fieldCryptoConfigured() first and refuse the write with a clear message.
 */
export function encryptField(
  value: string | null | undefined,
  context: FieldContext
): string | null {
  if (value == null || value === "") return null;
  if (isEncrypted(value)) return value;

  const key = primaryKey();
  if (!key) {
    throw new FieldCryptoError(
      "LUNA_FIELD_KEY is not set, so this field cannot be stored securely."
    );
  }

  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: 16 });
  cipher.setAAD(aad(context));
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    VERSION,
    keyId(key),
    iv.toString("base64"),
    tag.toString("base64"),
    ciphertext.toString("base64"),
  ].join(":");
}

/**
 * Decrypt a stored value, checking it belongs to the row asking for it.
 *
 * Returns null when the value cannot be read — a wrong key, a truncated
 * value, tampering, or a ciphertext that belongs to a DIFFERENT record.
 * Deliberately null rather than throwing: a passport number we cannot read
 * must show as absent, not take down the customer page.
 *
 * A v1 value (no key id, no binding) is still read, so nothing written by the
 * earlier scheme becomes unreadable. Nothing writes v1 any more.
 */
export function decryptField(
  value: string | null | undefined,
  context: FieldContext
): string | null {
  if (value == null || value === "") return null;
  if (!isEncrypted(value)) {
    // Plaintext from before this module existed. Readable, never written.
    return value;
  }

  const parts = value.split(":");
  const version = parts[0];

  let storedKeyId: string | null = null;
  let ivB64: string | undefined;
  let tagB64: string | undefined;
  let dataB64: string | undefined;
  let bound = false;

  if (version === VERSION) {
    [, storedKeyId, ivB64, tagB64, dataB64] = parts as [string, string, string, string, string];
    bound = true;
  } else if (version === "v1") {
    [, ivB64, tagB64, dataB64] = parts as [string, string, string, string];
  } else {
    return null;
  }
  if (!ivB64 || !tagB64 || !dataB64) return null;

  // Prefer the key the value names; fall back to the whole ring so a value
  // sealed before a rotation still reads.
  let keys: Buffer[];
  try {
    keys = keyring();
  } catch {
    return null;
  }
  if (storedKeyId) {
    const named = keys.filter((k) => keyId(k) === storedKeyId);
    if (named.length > 0) keys = named;
  }

  for (const key of keys) {
    try {
      const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivB64, "base64"), {
        authTagLength: 16,
      });
      decipher.setAuthTag(Buffer.from(tagB64, "base64"));
      if (bound) decipher.setAAD(aad(context));
      return Buffer.concat([
        decipher.update(Buffer.from(dataB64, "base64")),
        decipher.final(),
      ]).toString("utf8");
    } catch {
      // Wrong key, wrong row, or tampered. Try the next key, then give up.
    }
  }
  return null;
}

/** How many dots a mask shows, whatever the real length. */
const MASK_WIDTH = 8;

/**
 * What to show an agent who is not revealing: the last four characters, the
 * rest masked to a FIXED width. Enough to confirm you are looking at the
 * right document without putting the number on screen for anyone passing the
 * desk — and without publishing its length, which narrows the issuing country.
 */
export function maskPassport(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length <= 4) return "•".repeat(MASK_WIDTH);
  return "•".repeat(MASK_WIDTH) + trimmed.slice(-4);
}
