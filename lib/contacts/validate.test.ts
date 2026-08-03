import { describe, expect, it } from "vitest";
import { validateContact } from "@/lib/contacts/validate";

describe("editing a traveller", () => {
  it("keeps only the fields the form sent, so a PATCH changes nothing else", () => {
    const r = validateContact({ passport_expiry: "2030-01-01" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(Object.keys(r.patch)).toEqual(["passport_expiry"]);
  });

  it("takes a real passport expiry", () => {
    const r = validateContact({ passport_expiry: "2030-06-30" });
    expect(r.ok && r.patch.passport_expiry).toBe("2030-06-30");
  });

  it("clears a date when the field is emptied, rather than erroring", () => {
    const r = validateContact({ passport_expiry: "" });
    expect(r.ok && r.patch.passport_expiry).toBeNull();
  });

  it("refuses a date that isn't one", () => {
    expect(validateContact({ date_of_birth: "1st June" }).ok).toBe(false);
    expect(validateContact({ passport_expiry: "2030-13-40" }).ok).toBe(false);
  });

  it("refuses a malformed email but accepts a blank one", () => {
    expect(validateContact({ email: "not-an-email" }).ok).toBe(false);
    expect(validateContact({ email: "" }).ok && validateContact({ email: "" }).ok).toBe(true);
  });

  it("keeps only the flags it recognises", () => {
    const r = validateContact({ flags: ["allergy", "made_up", "vip", "allergy"] });
    expect(r.ok && r.patch.flags).toEqual(["allergy", "vip"]);
  });

  it("falls an unknown role back to 'other' rather than writing junk", () => {
    const r = validateContact({ role: "captain" });
    expect(r.ok && r.patch.role).toBe("other");
  });

  it("never accepts a passport number field, because it can't be stored safely yet", () => {
    const r = validateContact({ passport_number: "123456789", first_name: "Sam" }, true);
    expect(r.ok).toBe(true);
    if (r.ok) expect("passport_number" in r.patch).toBe(false);
  });
});

describe("adding a traveller", () => {
  it("insists on a first name", () => {
    expect(validateContact({}, true).ok).toBe(false);
    expect(validateContact({ first_name: "  " }, true).ok).toBe(false);
  });

  it("defaults a new traveller's role rather than demanding one", () => {
    const r = validateContact({ first_name: "Priya" }, true);
    expect(r.ok && r.patch.role).toBe("other");
  });

  it("takes a full set of details in one go", () => {
    const r = validateContact(
      {
        first_name: "Sam",
        last_name: "Whitfield",
        role: "child",
        date_of_birth: "2015-04-02",
        passport_expiry: "2029-08-01",
        dietary: "nut allergy",
        flags: ["allergy"],
      },
      true
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.patch.first_name).toBe("Sam");
      expect(r.patch.role).toBe("child");
      expect(r.patch.dietary).toBe("nut allergy");
    }
  });
});
