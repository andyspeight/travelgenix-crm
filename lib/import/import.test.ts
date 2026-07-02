import { describe, expect, it } from "vitest";
import { parseCsv } from "@/lib/import/csv";
import {
  applyMapping,
  heuristicMapping,
  normaliseHouseholdType,
  parseLenientDate,
  parseMoney,
  sanitizeMapping,
  type ColumnMapping,
} from "@/lib/import/schema";

describe("parseCsv", () => {
  it("parses a plain file with headers", () => {
    const { headers, rows } = parseCsv("Name,Email\nSarah,sarah@x.com\nJames,james@x.com");
    expect(headers).toEqual(["Name", "Email"]);
    expect(rows).toEqual([
      ["Sarah", "sarah@x.com"],
      ["James", "james@x.com"],
    ]);
  });

  it("handles quoted fields with commas, escaped quotes and newlines", () => {
    const csv = 'Name,Notes\n"Thompson, Sarah","Said ""no window seats""\nPrefers aisle"';
    const { rows } = parseCsv(csv);
    expect(rows[0][0]).toBe("Thompson, Sarah");
    expect(rows[0][1]).toBe('Said "no window seats"\nPrefers aisle');
  });

  it("strips a BOM, tolerates CRLF and pads ragged rows", () => {
    const csv = "﻿Name,Email,City\r\nSarah,sarah@x.com\r\n";
    const { headers, rows } = parseCsv(csv);
    expect(headers[0]).toBe("Name");
    expect(rows[0]).toEqual(["Sarah", "sarah@x.com", ""]);
  });

  it("skips blank lines and returns empty for an empty file", () => {
    expect(parseCsv("").rows).toEqual([]);
    expect(parseCsv("A,B\n\n1,2\n\n").rows).toEqual([["1", "2"]]);
  });
});

describe("heuristicMapping", () => {
  it("maps common CRM export headers", () => {
    const m = Object.fromEntries(
      heuristicMapping(["First Name", "Surname", "Email Address", "Mobile", "Town", "LTV", "Random Col"]).map(
        (x) => [x.source, x.target]
      )
    );
    expect(m["First Name"]).toBe("lead_first_name");
    expect(m["Surname"]).toBe("lead_last_name");
    expect(m["Email Address"]).toBe("lead_email");
    expect(m["Mobile"]).toBe("lead_phone");
    expect(m["Town"]).toBe("city");
    expect(m["LTV"]).toBe("lifetime_value");
    expect(m["Random Col"]).toBe("ignore");
  });

  it("never maps two columns to the same single-value field", () => {
    const m = heuristicMapping(["Email", "Work Email"]);
    expect(m[0].target).toBe("lead_email");
    expect(m[1].target).toBe("ignore");
  });
});

describe("normalisers", () => {
  it("normalises household types from synonyms", () => {
    expect(normaliseHouseholdType("Married")).toBe("couple");
    expect(normaliseHouseholdType("Family of 4")).toBe("family");
    expect(normaliseHouseholdType("individual")).toBe("solo");
    expect(normaliseHouseholdType("Corporate group")).toBe("group");
    expect(normaliseHouseholdType("whatever")).toBeNull();
  });

  it("parses UK, ISO, two-digit-year and month-name dates", () => {
    expect(parseLenientDate("2024-03-01")).toBe("2024-03-01");
    expect(parseLenientDate("01/03/2024")).toBe("2024-03-01"); // UK: 1 March
    expect(parseLenientDate("03/25/2024")).toBe("2024-03-25"); // unambiguously US
    expect(parseLenientDate("01/03/19")).toBe("2019-03-01");
    expect(parseLenientDate("2019")).toBe("2019-01-01");
    expect(parseLenientDate("12 Mar 2021")).toBe("2021-03-12");
    expect(parseLenientDate("not a date")).toBeNull();
  });

  it("parses money in the formats CRMs export", () => {
    expect(parseMoney("£12,500.50")).toBe(12500.5);
    expect(parseMoney("$3k")).toBe(3000);
    expect(parseMoney("12000")).toBe(12000);
    expect(parseMoney("")).toBeNull();
    expect(parseMoney("n/a")).toBeNull();
  });
});

describe("sanitizeMapping", () => {
  it("drops unknown targets and sources, keeps the last mapping per source", () => {
    const headers = ["A", "B"];
    const out = sanitizeMapping(
      [
        { source: "A", target: "lead_email" },
        { source: "A", target: "lead_phone" }, // overrides
        { source: "B", target: "not_a_field" },
        { source: "Ghost", target: "city" },
      ],
      headers
    );
    expect(out).toEqual([{ source: "A", target: "lead_phone" }]);
  });
});

describe("applyMapping", () => {
  const headers = ["Full Name", "Email", "Type", "Since", "Value", "Tags"];
  const mapping: ColumnMapping[] = [
    { source: "Full Name", target: "lead_full_name" },
    { source: "Email", target: "lead_email" },
    { source: "Type", target: "household_type" },
    { source: "Since", target: "customer_since" },
    { source: "Value", target: "lifetime_value" },
    { source: "Tags", target: "tags" },
  ];

  it("splits a full name, composes the display name and normalises fields", () => {
    const { customers, skipped, warnings } = applyMapping(
      headers,
      [["Sarah Jane Thompson", "sarah@x.com", "Married", "01/06/2019", "£38,000", "VIP; Repeat"]],
      mapping
    );
    expect(skipped).toHaveLength(0);
    expect(warnings).toHaveLength(0);
    const c = customers[0];
    expect(c.display_name).toBe("Sarah Jane Thompson");
    expect(c.lead.first_name).toBe("Sarah");
    expect(c.lead.last_name).toBe("Jane Thompson");
    expect(c.household_type).toBe("couple");
    expect(c.customer_since).toBe("2019-06-01");
    expect(c.lifetime_value).toBe(38000);
    expect(c.tags).toEqual(["VIP", "Repeat"]);
  });

  it("composes display name from separate first/last columns", () => {
    const h = ["First Name", "Last Name", "Email"];
    const m: ColumnMapping[] = [
      { source: "First Name", target: "lead_first_name" },
      { source: "Last Name", target: "lead_last_name" },
      { source: "Email", target: "lead_email" },
    ];
    const { customers } = applyMapping(h, [["James", "Thompson", "j@x.com"]], m);
    expect(customers[0].display_name).toBe("James Thompson");
    expect(customers[0].lead.first_name).toBe("James");
  });

  it("skips rows with nothing to identify them, warns on bad optional data", () => {
    const { customers, skipped, warnings } = applyMapping(
      headers,
      [
        ["", "", "", "", "", ""], // nothing at all
        ["Margaret Doyle", "not-an-email", "alien", "someday", "??", ""],
      ],
      mapping
    );
    expect(skipped).toHaveLength(1);
    expect(skipped[0].row).toBe(2); // Excel-style numbering (header = row 1)
    expect(customers).toHaveLength(1);
    const msgs = warnings.map((w) => w.message).join(" | ");
    expect(msgs).toMatch(/Invalid email/);
    expect(msgs).toMatch(/Unrecognised customer type/);
    expect(msgs).toMatch(/Couldn't read date/);
    expect(msgs).toMatch(/Couldn't read value/);
  });

  it("derives a name from the email when only an email exists", () => {
    const { customers } = applyMapping(headers, [["", "sarah@example.com", "", "", "", ""]], mapping);
    expect(customers[0].display_name).toBe("sarah");
    expect(customers[0].lead.email).toBe("sarah@example.com");
  });
});
