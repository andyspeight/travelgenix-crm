import { describe, expect, it } from "vitest";
import { parseCsv } from "@/lib/import/csv";
import { heuristicMapping, applyMapping } from "@/lib/import/schema";

const capsuleExport =
  "Name,Organisation,Email Address,Mobile,Town,Tags,Notes,Created,Total Spend\n" +
  '"Thompson, Sarah",,sarah.t@example.com,07700 900123,Poole,"VIP, Repeat","Nut allergy (Henry). Bad transfer Crete 2024",12/05/2019,"£38,250"\n' +
  '"Doyle, Margaret",Doyle Travel Ltd,m.doyle@example.com,,Salisbury,,,2021,£17k\n' +
  ",,,,,,,,\n" +
  '"Patel, Rajesh",,raj@example.com,07700 900456,Bournemouth,Family,,03/11/22,"12,000"';

describe("smoke: Capsule-style export end to end", () => {
  it("parses, heuristically maps and applies without AI", () => {
    const { headers, rows } = parseCsv(capsuleExport);
    const mapping = heuristicMapping(headers);
    const { customers, skipped, warnings } = applyMapping(headers, rows, mapping);

    expect(customers).toHaveLength(3);
    expect(skipped).toHaveLength(1); // the blank row

    const sarah = customers[0];
    expect(sarah.display_name).toBe("Thompson, Sarah");
    expect(sarah.lead.email).toBe("sarah.t@example.com");
    expect(sarah.city).toBe("Poole");
    expect(sarah.tags).toEqual(["VIP", "Repeat"]);
    expect(sarah.customer_since).toBe("2019-05-12");
    expect(sarah.lifetime_value).toBe(38250);
    expect(sarah.notes).toMatch(/Nut allergy/);

    const margaret = customers[1];
    expect(margaret.customer_since).toBe("2021-01-01");
    expect(margaret.lifetime_value).toBe(17000);

    const raj = customers[2];
    expect(raj.customer_since).toBe("2022-11-03");
    expect(raj.lifetime_value).toBe(12000);
    expect(warnings).toHaveLength(0);
  });
});
