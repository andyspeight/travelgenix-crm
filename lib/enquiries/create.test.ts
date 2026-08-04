import { describe, expect, it } from "vitest";
import { normaliseEnquiryFields } from "@/lib/enquiries/create";

describe("normaliseEnquiryFields", () => {
  it("requires a contact name", () => {
    expect(normaliseEnquiryFields({ contact_email: "a@b.com" })).toEqual({
      ok: false,
      error: "A contact name is required",
    });
  });

  it("rejects a malformed email", () => {
    const r = normaliseEnquiryFields({ contact_name: "Sarah", contact_email: "not-an-email" });
    expect(r.ok).toBe(false);
  });

  it("parses and clamps a full lead", () => {
    const r = normaliseEnquiryFields({
      contact_name: "  Sarah Thompson  ",
      contact_email: "sarah@example.com",
      destination: "Maldives",
      depart_date: "2026-09-14",
      date_flexibility: "flexible",
      duration_nights: "10",
      adults: 2,
      children: 2,
      budget: "8000",
      budget_basis: "total",
      must_haves: ["direct flights", "", "kids club"],
      source: "website",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.fields.contact_name).toBe("Sarah Thompson");
    expect(r.fields.destination).toBe("Maldives");
    expect(r.fields.depart_date).toBe("2026-09-14");
    expect(r.fields.date_flexibility).toBe("flexible");
    expect(r.fields.duration_nights).toBe(10);
    expect(r.fields.budget).toBe(8000);
    expect(r.fields.must_haves).toEqual(["direct flights", "kids club"]);
    expect(r.fields.source).toBe("website");
  });

  it("drops unknown enums and a bad date, and defaults source to manual", () => {
    const r = normaliseEnquiryFields({
      contact_name: "Jo",
      date_flexibility: "whenever",
      budget_basis: "monthly",
      depart_date: "14/09/2026",
      source: "carrier-pigeon",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.fields.date_flexibility).toBeNull();
    expect(r.fields.budget_basis).toBeNull();
    expect(r.fields.depart_date).toBeNull();
    expect(r.fields.source).toBe("manual");
  });

  it("keeps a valid household_id and drops a bad one", () => {
    const good = normaliseEnquiryFields({ contact_name: "Jo", household_id: "2bc5f641-4544-4323-bc3d-7563ece62708" });
    expect(good.ok && good.householdId).toBe("2bc5f641-4544-4323-bc3d-7563ece62708");
    const bad = normaliseEnquiryFields({ contact_name: "Jo", household_id: "nope" });
    expect(bad.ok && bad.householdId).toBeNull();
  });
});
