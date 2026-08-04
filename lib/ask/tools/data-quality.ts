/**
 * Query tool: data_quality
 *
 * Answers "who's missing an email?", "contacts with no phone/passport/DOB",
 * "records that need cleaning". A CRM that emails and checks passports is only
 * as good as its contact data, so this surfaces the gaps. Email/phone gaps are
 * counted for adults only (a child having no email isn't a fault); date of
 * birth and passport gaps apply to everyone, since everyone travels.
 */

import {
  type QueryTool,
  type QueryResult,
  type ResultRow,
  type Signal,
  listResult,
} from "../contract";

type ContactLite = {
  id: string;
  household_id: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  date_of_birth: string | null;
  passport_expiry: string | null;
  role: string | null;
};

type Field = "email" | "phone" | "passport" | "dob";
const FIELD_LABEL: Record<Field, string> = { email: "email", phone: "phone", passport: "passport", dob: "date of birth" };

export const dataQuality: QueryTool = {
  name: "data_quality",
  description:
    "Find contacts with missing details that the CRM needs: no email, no phone, no date of birth, or no passport. Use for 'who's missing an email', 'contacts with no phone', 'records that need cleaning', 'data gaps', 'who has no passport on file', 'unreachable contacts'.",
  examples: [
    "Who's missing an email?",
    "Contacts with no phone number",
    "Which records need cleaning?",
    "Who has no passport on file?",
    "Show me data gaps",
  ],
  params: [
    {
      name: "field",
      type: "enum",
      required: false,
      description: "Narrow to one gap. Omit to see all.",
      options: ["email", "phone", "passport", "dob"],
    },
  ],
  run: async (args, ctx): Promise<QueryResult> => {
    const only = typeof args.field === "string" && ["email", "phone", "passport", "dob"].includes(args.field) ? (args.field as Field) : null;

    const [{ data: contactRows }, { data: households }] = await Promise.all([
      ctx.db
        .from("contacts")
        .select("id, household_id, first_name, last_name, email, phone, date_of_birth, passport_expiry, role")
        .eq("agency_id", ctx.agencyId),
      ctx.db.from("households").select("id, display_name").eq("agency_id", ctx.agencyId),
    ]);

    const nameById = new Map<string, string>(
      ((households ?? []) as { id: string; display_name: string }[]).map((h) => [h.id, h.display_name])
    );

    const counts: Record<Field, number> = { email: 0, phone: 0, passport: 0, dob: 0 };
    const rows: ResultRow[] = [];

    for (const c of (contactRows ?? []) as ContactLite[]) {
      const adult = c.role !== "child";
      const gaps: Field[] = [];
      if (adult && !c.email) gaps.push("email");
      if (adult && !c.phone) gaps.push("phone");
      if (!c.date_of_birth) gaps.push("dob");
      if (!c.passport_expiry) gaps.push("passport");

      const relevant = only ? gaps.filter((g) => g === only) : gaps;
      if (relevant.length === 0) continue;
      for (const g of relevant) counts[g]++;

      rows.push({
        id: c.id,
        href: c.household_id ? `/customers/${c.household_id}` : "/customers",
        title: [c.first_name, c.last_name].filter(Boolean).join(" ") || "Contact",
        subtitle: [`missing: ${relevant.map((g) => FIELD_LABEL[g]).join(", ")}`, c.household_id ? nameById.get(c.household_id) : null]
          .filter(Boolean)
          .join(" · "),
      });
    }

    if (rows.length === 0) {
      return listResult([], only ? `No contacts are missing a ${FIELD_LABEL[only]}.` : "No contact-data gaps found — records look complete.");
    }

    const detailParts = (Object.keys(counts) as Field[])
      .filter((f) => counts[f] > 0 && (!only || only === f))
      .map((f) => `${counts[f]} missing ${FIELD_LABEL[f]}`);

    const signals: Signal[] = [
      {
        kind: "data_quality",
        detail: detailParts.join(", "),
        severity: "info",
      },
    ];

    const shown = rows.slice(0, 50);
    const summary =
      `${rows.length} contact${rows.length === 1 ? "" : "s"} with missing ${only ? FIELD_LABEL[only] : "details"}` +
      (rows.length > shown.length ? ` (showing ${shown.length}).` : ".");
    return listResult(shown, summary, signals, false);
  },
};
