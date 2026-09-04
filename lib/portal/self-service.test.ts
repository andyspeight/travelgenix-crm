import { describe, expect, it } from "vitest";
import { validateSelfService } from "@/lib/portal/self-service";

const ok = (input: Record<string, unknown>) => {
  const r = validateSelfService(input);
  if (!r.ok) throw new Error(`expected ok, got: ${r.error}`);
  return r.patch;
};

describe("validateSelfService", () => {
  it("takes a phone number as given, international formats included", () => {
    expect(ok({ phone: "  +44 (0)7700 900123 " }).contact.phone).toBe("+44 (0)7700 900123");
  });

  it("clears a field when it is emptied", () => {
    const p = ok({ phone: "", dietary: "" });
    expect(p.contact.phone).toBeNull();
    expect(p.contact.dietary).toBeNull();
  });

  it("splits contact fields from household fields", () => {
    const p = ok({ phone: "07700 900123", city: "Leeds", postcode: "LS1 4DY" });
    expect(p.contact).toEqual({ phone: "07700 900123" });
    expect(p.household).toEqual({ city: "Leeds", postcode: "LS1 4DY" });
  });

  it("reports what changed as plain words, and never the values", () => {
    const p = ok({ dietary: "Coeliac", address_line1: "1 High St", city: "Leeds" });
    expect(p.changed.sort()).toEqual(["address", "dietary needs"]);
    expect(JSON.stringify(p.changed)).not.toContain("Coeliac");
  });

  it("refuses fields a customer may not set", () => {
    const r = validateSelfService({ first_name: "Someone Else", passport_number: "123456789" });
    expect(r).toEqual({ ok: false, error: "Nothing to change." });
  });

  it("refuses an empty submission", () => {
    expect(validateSelfService({})).toEqual({ ok: false, error: "Nothing to change." });
  });

  it("rejects an over-long postcode and a non-string address", () => {
    expect(validateSelfService({ postcode: "X".repeat(13) }).ok).toBe(false);
    expect(validateSelfService({ city: 42 }).ok).toBe(false);
  });

  it("keeps the CRM's own caps on dietary text", () => {
    const p = ok({ dietary: "n".repeat(400) });
    expect(p.contact.dietary?.length).toBe(200);
  });
});
