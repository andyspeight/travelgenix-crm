import { beforeAll, describe, expect, it } from "vitest";
import { signPortalSession, verifyPortalSession, portalEnabled } from "./session";

beforeAll(() => {
  process.env.PORTAL_SESSION_SECRET = "test-portal-secret-please-change-32b";
});

const S = { agencyId: "agency-1", householdId: "household-1", contactId: "contact-1" };

describe("portal session token", () => {
  it("is enabled only when the secret is set", () => {
    expect(portalEnabled()).toBe(true);
  });

  it("round-trips a valid session", async () => {
    const token = await signPortalSession(S);
    expect(await verifyPortalSession(token)).toEqual(S);
  });

  it("rejects a tampered signature", async () => {
    const token = await signPortalSession(S);
    const flipped = token.slice(0, -1) + (token.endsWith("a") ? "b" : "a");
    expect(await verifyPortalSession(flipped)).toBeNull();
  });

  it("rejects a tampered payload", async () => {
    const token = await signPortalSession(S);
    const [, sig] = token.split(".");
    // A different payload with the old signature must not verify.
    const forged = `${Buffer.from(JSON.stringify({ ...S, agencyId: "other", exp: Date.now() + 1e6 })).toString("base64url")}.${sig}`;
    expect(await verifyPortalSession(forged)).toBeNull();
  });

  it("rejects an expired token", async () => {
    const token = await signPortalSession(S, Date.now() - 60_000, 1_000);
    expect(await verifyPortalSession(token)).toBeNull();
  });

  it("rejects garbage and empty input", async () => {
    expect(await verifyPortalSession("nonsense")).toBeNull();
    expect(await verifyPortalSession("")).toBeNull();
    expect(await verifyPortalSession(undefined)).toBeNull();
    expect(await verifyPortalSession("no-dot-here")).toBeNull();
  });
});
