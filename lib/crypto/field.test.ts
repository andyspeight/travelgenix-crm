import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  encryptField,
  decryptField,
  isEncrypted,
  maskPassport,
  fieldCryptoConfigured,
  activeKeyId,
  FieldCryptoError,
  type FieldContext,
} from "@/lib/crypto/field";

const KEY = "a".repeat(64);
const OTHER_KEY = "b".repeat(64);
const NEW_KEY = "c".repeat(64);

const ctx: FieldContext = {
  agencyId: "agency-1",
  recordId: "contact-1",
  field: "passport_number",
};
const otherRow: FieldContext = { ...ctx, recordId: "contact-2" };
const otherAgency: FieldContext = { ...ctx, agencyId: "agency-2" };

beforeEach(() => {
  process.env.LUNA_FIELD_KEY = KEY;
  delete process.env.LUNA_FIELD_KEY_OLD;
});
afterEach(() => {
  delete process.env.LUNA_FIELD_KEY;
  delete process.env.LUNA_FIELD_KEY_OLD;
});

describe("encryptField / decryptField", () => {
  it("round-trips a passport number", () => {
    const n = "GBR123456789";
    const stored = encryptField(n, ctx)!;
    expect(stored).not.toContain(n); // the number is not in the stored value
    expect(decryptField(stored, ctx)).toBe(n);
  });

  it("produces different ciphertext each time, so equal numbers are not obvious", () => {
    const a = encryptField("SAME12345", ctx)!;
    const b = encryptField("SAME12345", ctx)!;
    expect(a).not.toBe(b); // fresh IV per encryption
    expect(decryptField(a, ctx)).toBe(decryptField(b, ctx));
  });

  it("absent stays absent — never ciphertext of nothing", () => {
    expect(encryptField(null, ctx)).toBeNull();
    expect(encryptField("", ctx)).toBeNull();
    expect(encryptField(undefined, ctx)).toBeNull();
    expect(decryptField(null, ctx)).toBeNull();
  });

  it("never double-encrypts, so re-saving a record stays readable", () => {
    const once = encryptField("GBR999", ctx)!;
    const twice = encryptField(once, ctx)!;
    expect(twice).toBe(once);
    expect(decryptField(twice, ctx)).toBe("GBR999");
  });

  it("refuses to decrypt with the wrong key, rather than returning nonsense", () => {
    const stored = encryptField("GBR123456789", ctx)!;
    process.env.LUNA_FIELD_KEY = OTHER_KEY;
    expect(decryptField(stored, ctx)).toBeNull();
  });

  it("detects tampering — a changed byte does not decrypt", () => {
    const stored = encryptField("GBR123456789", ctx)!;
    const parts = stored.split(":");
    const data = parts[4]!;
    const flipped = data[0] === "A" ? "B" : "A";
    parts[4] = flipped + data.slice(1);
    expect(decryptField(parts.join(":"), ctx)).toBeNull();
  });

  it("survives a truncated or malformed value without throwing", () => {
    expect(decryptField("v2:only-one-part", ctx)).toBeNull();
    expect(decryptField("v2::::", ctx)).toBeNull();
    expect(decryptField("v9:whatever:x:y:z", ctx)).toBeNull();
  });

  it("marks encrypted values so they are recognisable in a dump", () => {
    expect(isEncrypted(encryptField("GBR123", ctx))).toBe(true);
    expect(isEncrypted("GBR123")).toBe(false);
    expect(isEncrypted(null)).toBe(false);
  });
});

describe("binding to the row it belongs to", () => {
  it("a ciphertext moved to another contact does not decrypt", () => {
    const stored = encryptField("GBR123456789", ctx)!;
    expect(decryptField(stored, otherRow)).toBeNull();
  });

  it("a ciphertext moved to another agency does not decrypt", () => {
    const stored = encryptField("GBR123456789", ctx)!;
    expect(decryptField(stored, otherAgency)).toBeNull();
  });

  it("a ciphertext read as a different field does not decrypt", () => {
    const stored = encryptField("GBR123456789", ctx)!;
    expect(decryptField(stored, { ...ctx, field: "notes" })).toBeNull();
  });

  it("still reads for the row it was written for", () => {
    const stored = encryptField("GBR123456789", ctx)!;
    expect(decryptField(stored, { ...ctx })).toBe("GBR123456789");
  });
});

describe("key rotation", () => {
  it("names the key that sealed each value, without revealing the key", () => {
    const stored = encryptField("GBR123456789", ctx)!;
    const id = stored.split(":")[1]!;
    expect(id).toMatch(/^[0-9a-f]{8}$/);
    expect(KEY).not.toContain(id);
    expect(activeKeyId()).toBe(id);
  });

  it("reads a value sealed by the retiring key after the new key takes over", () => {
    const sealedByOld = encryptField("GBR123456789", ctx)!;
    process.env.LUNA_FIELD_KEY = NEW_KEY;
    process.env.LUNA_FIELD_KEY_OLD = KEY;
    expect(decryptField(sealedByOld, ctx)).toBe("GBR123456789");
    // New writes use the new key.
    expect(encryptField("NEW1", ctx)!.split(":")[1]).toBe(activeKeyId());
  });

  it("stops reading the retired key once it is removed", () => {
    const sealedByOld = encryptField("GBR123456789", ctx)!;
    process.env.LUNA_FIELD_KEY = NEW_KEY;
    expect(decryptField(sealedByOld, ctx)).toBeNull();
  });
});

describe("fail closed", () => {
  it("refuses to write when no key is configured", () => {
    delete process.env.LUNA_FIELD_KEY;
    expect(fieldCryptoConfigured()).toBe(false);
    expect(() => encryptField("GBR123", ctx)).toThrow(FieldCryptoError);
  });

  it("refuses a key that is not 32 bytes of hex", () => {
    process.env.LUNA_FIELD_KEY = "too-short";
    expect(fieldCryptoConfigured()).toBe(false);
    expect(() => encryptField("GBR123", ctx)).toThrow(/64 hex characters/);
  });

  it("reports not-configured rather than throwing on a status check", () => {
    process.env.LUNA_FIELD_KEY = "nonsense";
    expect(() => fieldCryptoConfigured()).not.toThrow();
  });
});

describe("backwards compatibility", () => {
  it("reads plaintext written before this module existed", () => {
    expect(decryptField("OLD-PLAINTEXT-123", ctx)).toBe("OLD-PLAINTEXT-123");
  });
});

describe("maskPassport", () => {
  it("shows only the last four, enough to confirm the right document", () => {
    expect(maskPassport("GBR123456789")).toBe("••••••••6789");
  });

  it("masks to a fixed width, so the number's length is not published", () => {
    // Same visible tail, very different real lengths: the masks must match.
    expect(maskPassport("GBR12345_6789")).toBe(maskPassport("AB6789"));
    // And a short value is padded rather than revealing how short it is.
    expect(maskPassport("1234")).toBe("••••••••");
  });

  it("nothing to mask stays nothing", () => {
    expect(maskPassport(null)).toBeNull();
    expect(maskPassport("")).toBeNull();
    expect(maskPassport("   ")).toBeNull();
  });
});
