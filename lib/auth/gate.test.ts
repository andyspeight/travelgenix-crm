import { describe, expect, it } from "vitest";
import { signAccessToken, verifyAccessToken, safeEqual } from "@/lib/auth/gate";

const SECRET = "test-secret";
const NOW = 1_784_900_000_000;

describe("access gate tokens", () => {
  it("round-trips: a freshly signed token verifies", async () => {
    const token = await signAccessToken(SECRET, NOW);
    expect(await verifyAccessToken(SECRET, token, NOW)).toBe(true);
  });

  it("expires: the same token fails once its expiry passes", async () => {
    const token = await signAccessToken(SECRET, NOW, 1000);
    expect(await verifyAccessToken(SECRET, token, NOW + 999)).toBe(true);
    expect(await verifyAccessToken(SECRET, token, NOW + 1001)).toBe(false);
  });

  it("tampering with the expiry invalidates the signature", async () => {
    const token = await signAccessToken(SECRET, NOW, 1000);
    const [exp, sig] = token.split(".");
    const forged = `${Number(exp) + 9_999_999}.${sig}`;
    expect(await verifyAccessToken(SECRET, forged, NOW)).toBe(false);
  });

  it("a token signed with a different secret fails", async () => {
    const token = await signAccessToken("other-secret", NOW);
    expect(await verifyAccessToken(SECRET, token, NOW)).toBe(false);
  });

  it("garbage never verifies", async () => {
    for (const bad of [undefined, null, "", "no-dot", ".sig", "123.", "abc.def"]) {
      expect(await verifyAccessToken(SECRET, bad as string | null | undefined, NOW)).toBe(false);
    }
  });
});

describe("safeEqual", () => {
  it("matches equal strings and rejects near-misses", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
  });
});
