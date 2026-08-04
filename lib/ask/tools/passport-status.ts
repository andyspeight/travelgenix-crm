/**
 * Query tool: passport_status
 *
 * Answers "any passport issues?", "whose passport is expiring?", "does the
 * Thompson family have a passport problem?", "passport expiry alerts". Scans
 * every traveller for expired passports, passports without enough validity for
 * an upcoming trip (the six-month rule), passports lapsing soon, and missing
 * passports where a trip is booked. Optionally narrows to one named customer
 * or traveller.
 *
 * All signals are computed in code (lib/passports/status.ts) — the model
 * narrates them, never invents a passport date.
 */

import {
  type QueryTool,
  type QueryResult,
  type ResultRow,
  type Signal,
  listResult,
  emptyResult,
} from "../contract";
import {
  scanPassports,
  summarisePassports,
  PASSPORT_KIND_LABEL,
  type PassportContact,
  type PassportTrip,
} from "@/lib/passports/status";

export const passportStatus: QueryTool = {
  name: "passport_status",
  description:
    "Check passport and travel-document status across travellers: expired passports, passports without enough validity for an upcoming trip (most countries need 6 months beyond travel), passports expiring soon, and missing passports where a trip is booked. Use for 'any passport issues', 'passport expiry alerts', 'whose passport is expiring', 'document status', or to check a named customer/traveller.",
  examples: [
    "Any passport issues?",
    "Whose passport is expiring soon?",
    "Passport expiry alerts",
    "Does the Thompson family have any passport problems?",
    "Which travellers don't have enough passport validity for their trip?",
    "Passport status for Margaret Collins",
  ],
  params: [
    {
      name: "customer",
      type: "string",
      required: false,
      description: "Optional: a customer/household name or traveller name to check just them.",
    },
    {
      name: "months",
      type: "number",
      required: false,
      description: "Validity margin in months to treat as thin (default 6).",
    },
  ],
  run: async (args, ctx): Promise<QueryResult> => {
    const months =
      args.months != null && !Number.isNaN(Number(args.months))
        ? Math.min(Math.max(Number(args.months), 1), 24)
        : undefined;
    const nameQuery = typeof args.customer === "string" ? args.customer.trim().toLowerCase() : "";

    const [{ data: contacts }, { data: trips }, { data: households }] = await Promise.all([
      ctx.db
        .from("contacts")
        .select("id, household_id, first_name, last_name, passport_expiry")
        .eq("agency_id", ctx.agencyId),
      ctx.db
        .from("trips")
        .select("household_id, destination, depart_date, stage")
        .eq("agency_id", ctx.agencyId),
      ctx.db.from("households").select("id, display_name").eq("agency_id", ctx.agencyId),
    ]);

    const nameById = new Map<string, string>(
      ((households ?? []) as { id: string; display_name: string }[]).map((h) => [h.id, h.display_name])
    );

    let people = (contacts ?? []) as PassportContact[];
    if (nameQuery) {
      people = people.filter((c) => {
        const hh = (nameById.get(c.household_id) ?? "").toLowerCase();
        const person = [c.first_name, c.last_name].filter(Boolean).join(" ").toLowerCase();
        return hh.includes(nameQuery) || person.includes(nameQuery);
      });
    }

    const issues = scanPassports(
      people,
      (trips ?? []) as PassportTrip[],
      ctx.now,
      months ? { marginMonths: months } : {}
    );

    if (issues.length === 0) {
      const who = nameQuery ? `for “${(args.customer as string).trim()}”` : "across your travellers";
      return emptyResult(
        `No passport issues ${who}. Everyone with an upcoming trip has enough validity on file.`
      );
    }

    const shown = issues.slice(0, 25);
    const rows: ResultRow[] = shown.map((i) => ({
      id: i.contactId,
      href: `/customers/${i.householdId}`,
      title: i.travellerName,
      subtitle: [i.detail, nameById.get(i.householdId)].filter(Boolean).join(" · "),
      badges: [PASSPORT_KIND_LABEL[i.kind]],
      meta: { expiry: i.expiry, kind: i.kind },
    }));

    const warnings = issues.filter((i) => i.severity === "warning");
    const signals: Signal[] = [
      {
        kind: "passport_risk",
        detail: summarisePassports(issues),
        severity: warnings.length > 0 ? "warning" : "info",
        rowIds: warnings.slice(0, 10).map((i) => i.contactId),
      },
    ];

    const summary =
      summarisePassports(issues) + (issues.length > shown.length ? ` Showing the first ${shown.length}.` : "");
    return listResult(rows, summary, signals, true);
  },
};
