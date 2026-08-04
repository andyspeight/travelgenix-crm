import { describe, expect, it } from "vitest";
import { buildSignatureHeader, verifySignature, signPayload } from "@/lib/widget/signature";

const SECRET = "a".repeat(64);
const NOW = new Date("2026-08-04T12:00:00.000Z");
const BODY = JSON.stringify({ contact_name: "Sarah", contact_email: "sarah@example.com" });

describe("verifySignature", () => {
  it("accepts a correctly signed body", () => {
    const header = buildSignatureHeader(SECRET, BODY, NOW);
    expect(verifySignature({ header, rawBody: BODY, secret: SECRET, now: NOW })).toEqual({ ok: true });
  });

  it("rejects a tampered body", () => {
    const header = buildSignatureHeader(SECRET, BODY, NOW);
    const r = verifySignature({ header, rawBody: BODY + " ", secret: SECRET, now: NOW });
    expect(r.ok).toBe(false);
  });

  it("rejects the wrong secret", () => {
    const header = buildSignatureHeader(SECRET, BODY, NOW);
    expect(verifySignature({ header, rawBody: BODY, secret: "b".repeat(64), now: NOW }).ok).toBe(false);
  });

  it("rejects a stale timestamp (replay window)", () => {
    const header = buildSignatureHeader(SECRET, BODY, NOW);
    const later = new Date(NOW.getTime() + 10 * 60 * 1000); // 10 min later
    const r = verifySignature({ header, rawBody: BODY, secret: SECRET, now: later });
    expect(r).toEqual({ ok: false, reason: "expired signature" });
  });

  it("rejects a missing or malformed header", () => {
    expect(verifySignature({ header: null, rawBody: BODY, secret: SECRET, now: NOW }).ok).toBe(false);
    expect(verifySignature({ header: "nonsense", rawBody: BODY, secret: SECRET, now: NOW }).ok).toBe(false);
    expect(verifySignature({ header: "t=abc,v1=xyz", rawBody: BODY, secret: SECRET, now: NOW }).ok).toBe(false);
  });

  it("signPayload is deterministic for the same inputs", () => {
    expect(signPayload(SECRET, 1000, BODY)).toBe(signPayload(SECRET, 1000, BODY));
  });
});
