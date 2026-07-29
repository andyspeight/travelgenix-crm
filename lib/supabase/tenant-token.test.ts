import { describe, expect, it } from "vitest";
import { createHmac } from "crypto";
import { mintTenantToken, decodeClaims } from "@/lib/supabase/tenant-token";

const SECRET = "test-secret-at-least-32-characters-long!!";
const AGENCY = "00000000-0000-0000-0000-000000000001";
const NOW = 1_785_000_000_000;

describe("mintTenantToken", () => {
  it("carries the agency and the role PostgREST expects", () => {
    const claims = decodeClaims(mintTenantToken(AGENCY, SECRET, NOW))!;
    expect(claims.agency_id).toBe(AGENCY);
    expect(claims.role).toBe("authenticated");
    expect(claims.aud).toBe("authenticated");
  });

  it("expires in a minute — it lives for one round trip, not a session", () => {
    const claims = decodeClaims(mintTenantToken(AGENCY, SECRET, NOW))!;
    expect((claims.exp as number) - (claims.iat as number)).toBe(60);
    expect(claims.iat).toBe(Math.floor(NOW / 1000));
  });

  it("signs with the secret, so a forged agency fails verification", () => {
    const token = mintTenantToken(AGENCY, SECRET, NOW);
    const [h, p, sig] = token.split(".");

    // Recompute honestly: the signature must match.
    const expected = createHmac("sha256", SECRET)
      .update(`${h}.${p}`)
      .digest("base64")
      .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    expect(sig).toBe(expected);

    // Tamper with the claims and the old signature no longer fits.
    const forged = Buffer.from(
      JSON.stringify({ ...decodeClaims(token), agency_id: "someone-else" })
    ).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const reSigned = createHmac("sha256", SECRET)
      .update(`${h}.${forged}`)
      .digest("base64")
      .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    expect(reSigned).not.toBe(sig);
  });

  it("is base64url — no characters that would break a header", () => {
    const token = mintTenantToken(AGENCY, SECRET, NOW);
    expect(token).not.toMatch(/[+/=]/);
    expect(token.split(".")).toHaveLength(3);
  });

  it("different agencies never produce the same token", () => {
    expect(mintTenantToken("agency-a", SECRET, NOW)).not.toBe(
      mintTenantToken("agency-b", SECRET, NOW)
    );
  });
});

describe("decodeClaims", () => {
  it("returns null on rubbish rather than throwing", () => {
    expect(decodeClaims("not-a-token")).toBeNull();
    expect(decodeClaims("")).toBeNull();
  });
});
