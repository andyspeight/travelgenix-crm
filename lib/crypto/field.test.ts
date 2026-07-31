import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  encryptField,
  decryptField,
  isEncrypted,
  maskPassport,
  fieldCryptoConfigured,
} from "@/lib/crypto/field";

const KEY = "a".repeat(64); // 32 bytes of hex
const OTHER_KEY = "b".repeat(64);

beforeEach(() => {
  process.env.LUNA_FIELD_KEY = KEY;
});
afterEach(() => {
  delete process.env.LUNA_FIELD_KEY;
});

describe("encryptField / decryptField", () => {
  it("round-trips a passport number", () => {
    const n = "GBR123456789";
    const stored = encryptField(n)!;
    expect(stored).not.toContain(n); // the number is not in the stored value
    expect(decryptField(stored)).toBe(n);
  });

  it("produces different ciphertext each time, so equal numbers are not obvious", () => {
    const a = encryptField("SAME12345")!;
    const b = encryptField("SAME12345")!;
    expect(a).not.toBe(b); // fresh IV per encryption
    expect(decryptField(a)).toBe(decryptField(b));
  });

  it("absent stays absent — never ciphertext of nothing", () => {
    expect(encryptField(null)).toBeNull();
    expect(encryptField("")).toBeNull();
    expect(encryptField(undefined)).toBeNull();
    expect(decryptField(null)).toBeNull();
  });

  it("never double-encrypts, so re-saving a record stays readable", () => {
    const once = encryptField("GBR999")!;
    const twice = encryptField(once)!;
    expect(twice).toBe(once);
    expect(decryptField(twice)).toBe("GBR999");
  });

  it("reads plaintext written before a key existed", () => {
    expect(decryptField("OLD-PLAINTEXT-123")).toBe("OLD-PLAINTEXT-123");
  });

  it("refuses to decrypt with the wrong key, rather than returning nonsense", () => {
    const stored = encryptField("GBR123456789")!;
    process.env.LUNA_FIELD_KEY = OTHER_KEY;
    expect(decryptField(stored)).toBeNull();
  });

  it("detects tampering — a changed byte does not decrypt", () => {
    const stored = encryptField("GBR123456789")!;
    const [v, iv, tag, data] = stored.split(":");
    const flipped = data[0] === "A" ? "B" : "A";
    expect(decryptField(`${v}:${iv}:${tag}:${flipped}${data.slice(1)}`)).toBeNull();
  });

  it("survives a truncated or malformed value without throwing", () => {
    expect(decryptField("v1:only-one-part")).toBeNull();
    expect(decryptField("v1:::")).toBeNull();
  });

  it("with no key configured, stores as-is rather than pretending", () => {
    delete process.env.LUNA_FIELD_KEY;
    expect(fieldCryptoConfigured()).toBe(false);
    expect(encryptField("GBR123")).toBe("GBR123");
  });

  it("marks encrypted values so they are recognisable in a dump", () => {
    expect(isEncrypted(encryptField("GBR123"))).toBe(true);
    expect(isEncrypted("GBR123")).toBe(false);
    expect(isEncrypted(null)).toBe(false);
  });
});

describe("maskPassport", () => {
  it("shows only the last four, enough to confirm the right document", () => {
    expect(maskPassport("GBR123456789")).toBe("••••••••6789");
  });

  it("does not leak length information on very short values", () => {
    expect(maskPassport("1234")).toBe("••••");
    expect(maskPassport("12")).toBe("••");
  });

  it("nothing to mask stays nothing", () => {
    expect(maskPassport(null)).toBeNull();
    expect(maskPassport("")).toBeNull();
  });
});
