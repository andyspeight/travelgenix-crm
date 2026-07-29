import { describe, expect, it } from "vitest";
import { decideSend, type SendFacts } from "@/lib/email/policy";

const facts = (over: Partial<SendFacts> = {}): SendFacts => ({
  purpose: "operational",
  toEmail: "customer@example.com",
  consent: "unknown",
  suppressed: false,
  ...over,
});

describe("decideSend", () => {
  it("blocks a missing or malformed address for any purpose", () => {
    expect(decideSend(facts({ toEmail: null })).allowed).toBe(false);
    expect(decideSend(facts({ toEmail: "not-an-address" })).allowed).toBe(false);
  });

  it("blocks a suppressed address even for operational sends, naming why", () => {
    const d = decideSend(
      facts({ suppressed: true, suppressionReason: "bounce" })
    );
    expect(d.allowed).toBe(false);
    if (!d.allowed) expect(d.reason).toMatch(/hard-bounced/);
  });

  it("spam complaints block with their own reason", () => {
    const d = decideSend(
      facts({ purpose: "marketing", consent: "granted", suppressed: true, suppressionReason: "complaint" })
    );
    expect(d.allowed).toBe(false);
    if (!d.allowed) expect(d.reason).toMatch(/spam/);
  });

  it("operational sends need no consent — a reply is not marketing", () => {
    expect(decideSend(facts({ consent: "unknown" })).allowed).toBe(true);
    expect(decideSend(facts({ consent: "no_contact_record" })).allowed).toBe(true);
    // Even an explicit marketing refusal does not block booking admin.
    expect(decideSend(facts({ consent: "refused" })).allowed).toBe(true);
  });

  it("marketing needs a positive grant: refused AND unknown both block", () => {
    expect(
      decideSend(facts({ purpose: "marketing", consent: "granted" })).allowed
    ).toBe(true);
    for (const consent of ["refused", "unknown", "no_contact_record"] as const) {
      const d = decideSend(facts({ purpose: "marketing", consent }));
      expect(d.allowed).toBe(false);
    }
  });

  it("a marketing refusal explains itself differently from missing consent", () => {
    const refused = decideSend(facts({ purpose: "marketing", consent: "refused" }));
    const unknown = decideSend(facts({ purpose: "marketing", consent: "unknown" }));
    if (!refused.allowed && !unknown.allowed) {
      expect(refused.reason).not.toBe(unknown.reason);
      expect(refused.reason).toMatch(/refused/);
      expect(unknown.reason).toMatch(/no marketing email consent/);
    } else {
      throw new Error("both should block");
    }
  });
});
