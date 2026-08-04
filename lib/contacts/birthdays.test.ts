import { describe, expect, it } from "vitest";
import { daysUntilBirthday, ageTurning } from "@/lib/contacts/birthdays";

const NOW = new Date("2026-08-04T12:00:00.000Z");

describe("daysUntilBirthday", () => {
  it("is 0 when the birthday is today", () => {
    expect(daysUntilBirthday("1985-08-04", NOW)).toBe(0);
  });
  it("counts forward to a birthday later this year", () => {
    expect(daysUntilBirthday("1990-08-14", NOW)).toBe(10);
  });
  it("rolls into next year once this year's has passed", () => {
    // 14 June already gone this year → next is 2027-06-14.
    const d = daysUntilBirthday("1985-06-14", NOW);
    expect(d).toBeGreaterThan(300);
    expect(d).toBeLessThan(320);
  });
  it("returns null for an unparseable date", () => {
    expect(daysUntilBirthday("not-a-date", NOW)).toBeNull();
  });
});

describe("ageTurning", () => {
  it("is the age they reach on the next birthday", () => {
    expect(ageTurning("1990-08-14", NOW)).toBe(36); // turns 36 on 2026-08-14
  });
  it("uses this year when the birthday is today", () => {
    expect(ageTurning("1985-08-04", NOW)).toBe(41);
  });
  it("uses next year when this year's has passed", () => {
    expect(ageTurning("1985-06-14", NOW)).toBe(42); // next birthday 2027 → turns 42
  });
});
