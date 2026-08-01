import { describe, expect, it } from "vitest";
import {
  keyFrom,
  validateDef,
  coerceValue,
  cleanValues,
  displayValue,
  sortDefs,
  archivedWithValues,
  type FieldDef,
} from "@/lib/custom-fields/schema";

const def = (over: Partial<FieldDef> = {}): FieldDef => ({
  id: "f1",
  entity: "household",
  key: "loyalty_number",
  label: "Loyalty number",
  type: "text",
  options: [],
  help: null,
  position: 0,
  archived: false,
  ...over,
});

describe("naming a field", () => {
  it("makes a stable key from a human label", () => {
    expect(keyFrom("Loyalty number")).toBe("loyalty_number");
    expect(keyFrom("  Wedding Date!  ")).toBe("wedding_date");
  });

  it("never produces an empty key", () => {
    expect(keyFrom("!!!")).toBe("field");
  });

  it("refuses a second field with the same name", () => {
    const result = validateDef({ label: "Loyalty number", type: "text" }, ["loyalty_number"]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/already have a field/);
  });

  it("wants a name and a type", () => {
    expect(validateDef({ label: "x", type: "text" }).ok).toBe(false);
    expect(validateDef({ label: "Office", type: "wat" }).ok).toBe(false);
  });

  it("insists a list has options worth choosing between", () => {
    expect(validateDef({ label: "Office", type: "select", options: ["Leeds"] }).ok).toBe(false);
    const good = validateDef({ label: "Office", type: "select", options: ["Leeds", "York"] });
    expect(good.ok).toBe(true);
    if (good.ok) expect(good.def.options).toEqual(["Leeds", "York"]);
  });

  it("drops duplicate and empty options rather than storing them", () => {
    const result = validateDef({ label: "Office", type: "select", options: ["Leeds", "Leeds", "  ", "York"] });
    expect(result.ok && result.def.options).toEqual(["Leeds", "York"]);
  });
});

describe("a value has to fit its field", () => {
  it("treats blank as not recorded, never as zero", () => {
    expect(coerceValue(def({ type: "number" }), "")).toEqual({ ok: true, value: null });
    expect(coerceValue(def({ type: "number" }), null)).toEqual({ ok: true, value: null });
  });

  it("reads a number a person would type", () => {
    expect(coerceValue(def({ type: "number" }), "1,240")).toEqual({ ok: true, value: 1240 });
    expect(coerceValue(def({ type: "number" }), "£99.50")).toEqual({ ok: true, value: 99.5 });
  });

  it("refuses a number that is not one", () => {
    const result = coerceValue(def({ type: "number", label: "Nights" }), "about three");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("Nights must be a number.");
  });

  it("wants a real date in a known shape", () => {
    expect(coerceValue(def({ type: "date" }), "2026-08-01").ok).toBe(true);
    expect(coerceValue(def({ type: "date" }), "1st August").ok).toBe(false);
    expect(coerceValue(def({ type: "date" }), "2026-13-45").ok).toBe(false);
  });

  it("refuses a choice that is not on the list", () => {
    const field = def({ type: "select", label: "Office", options: ["Leeds", "York"] });
    expect(coerceValue(field, "Leeds").ok).toBe(true);
    const bad = coerceValue(field, "Hull");
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error).toMatch(/isn't one of the options/);
  });

  it("takes several choices, and refuses one that is not on the list", () => {
    const field = def({ type: "multi_select", options: ["Ski", "Beach", "City"] });
    expect(coerceValue(field, ["Ski", "Beach"])).toEqual({ ok: true, value: ["Ski", "Beach"] });
    expect(coerceValue(field, ["Ski", "Space"]).ok).toBe(false);
  });

  it("caps a runaway text value", () => {
    expect(coerceValue(def({ type: "text" }), "x".repeat(2000)).ok).toBe(false);
  });
});

describe("what a browser is allowed to write", () => {
  const defs = [
    def({ key: "loyalty_number", type: "text" }),
    def({ id: "f2", key: "office", type: "select", label: "Office", options: ["Leeds", "York"] }),
    def({ id: "f3", key: "old_code", type: "text", label: "Old code", archived: true }),
  ];

  it("drops a key it does not know, without comment", () => {
    const { values, errors } = cleanValues(defs, {
      loyalty_number: "AB123",
      is_admin: true,
      "'; drop table": "x",
    });
    expect(values).toEqual({ loyalty_number: "AB123" });
    expect(errors).toEqual([]);
  });

  it("refuses to write into an archived field", () => {
    const { values } = cleanValues(defs, { old_code: "still trying" });
    expect(values).toEqual({});
  });

  it("collects the reasons rather than failing on the first", () => {
    const { errors } = cleanValues(defs, { office: "Hull", loyalty_number: "x".repeat(2000) });
    expect(errors).toHaveLength(2);
  });

  it("refuses something that is not an object at all", () => {
    expect(cleanValues(defs, "loyalty_number=AB123").errors).toHaveLength(1);
    expect(cleanValues(defs, [1, 2, 3]).errors).toHaveLength(1);
  });
});

describe("how a value reads", () => {
  it("shows a dash rather than a blank that looks broken", () => {
    expect(displayValue(def(), null)).toBe("—");
  });

  it("says yes and no, not true and false", () => {
    expect(displayValue(def({ type: "checkbox" }), true)).toBe("Yes");
    expect(displayValue(def({ type: "checkbox" }), false)).toBe("No");
  });

  it("writes a date the way a person reads one", () => {
    expect(displayValue(def({ type: "date" }), "2026-08-01")).toBe("1 Aug 2026");
  });

  it("keeps showing a choice that was removed from the list, marked", () => {
    const field = def({ type: "select", options: ["Leeds", "York"] });
    expect(displayValue(field, "Hull")).toBe("Hull (no longer an option)");
  });

  it("lists several choices plainly", () => {
    const field = def({ type: "multi_select", options: ["Ski", "Beach"] });
    expect(displayValue(field, ["Ski", "Beach"])).toBe("Ski, Beach");
  });
});

describe("what still shows after a field is retired", () => {
  it("keeps an archived field visible while it holds something", () => {
    const defs = [def({ key: "old_code", archived: true })];
    expect(archivedWithValues(defs, { old_code: "AB1" })).toHaveLength(1);
  });

  it("stays quiet about an archived field that is empty", () => {
    const defs = [def({ key: "old_code", archived: true })];
    expect(archivedWithValues(defs, { old_code: null })).toHaveLength(0);
    expect(archivedWithValues(defs, {})).toHaveLength(0);
  });

  it("orders fields the way the agency arranged them", () => {
    const ordered = sortDefs([
      def({ id: "b", label: "Beta", position: 2 }),
      def({ id: "a", label: "Alpha", position: 1 }),
    ]);
    expect(ordered.map((d) => d.id)).toEqual(["a", "b"]);
  });
});
