/**
 * Query tool: upcoming_birthdays
 *
 * Answers "whose birthday is coming up?", "any customer birthdays this month?".
 * Uses the real date_of_birth on contacts, so it's exact — days to the next
 * birthday and the age they'll turn. A relationship-marketing hook: a card or a
 * call at the right moment.
 */

import {
  type QueryTool,
  type QueryResult,
  type ResultRow,
  type Signal,
  listResult,
} from "../contract";
import { daysUntilBirthday, ageTurning } from "@/lib/contacts/birthdays";

type ContactLite = {
  id: string;
  household_id: string | null;
  first_name: string | null;
  last_name: string | null;
  date_of_birth: string | null;
  role: string | null;
};

export const upcomingBirthdays: QueryTool = {
  name: "upcoming_birthdays",
  description:
    "List customers/travellers whose birthday is coming up within a window (default 30 days), soonest first, with the age they'll turn. Use for 'whose birthday is coming up', 'any birthdays this month', 'upcoming birthdays', 'who's got a birthday soon'.",
  examples: [
    "Whose birthday is coming up?",
    "Any customer birthdays this month?",
    "Upcoming birthdays in the next two weeks",
    "Who's got a birthday soon?",
  ],
  params: [
    {
      name: "days",
      type: "number",
      required: false,
      description: "How many days ahead to look (default 30).",
    },
  ],
  run: async (args, ctx): Promise<QueryResult> => {
    const windowDays = args.days != null && !Number.isNaN(Number(args.days)) ? Math.min(Math.max(Number(args.days), 1), 366) : 30;

    const [{ data: contactRows }, { data: households }] = await Promise.all([
      ctx.db
        .from("contacts")
        .select("id, household_id, first_name, last_name, date_of_birth, role")
        .eq("agency_id", ctx.agencyId),
      ctx.db.from("households").select("id, display_name").eq("agency_id", ctx.agencyId),
    ]);

    const nameById = new Map<string, string>(
      ((households ?? []) as { id: string; display_name: string }[]).map((h) => [h.id, h.display_name])
    );

    const upcoming = ((contactRows ?? []) as ContactLite[])
      .filter((c) => c.date_of_birth)
      .map((c) => ({ c, days: daysUntilBirthday(c.date_of_birth as string, ctx.now), age: ageTurning(c.date_of_birth as string, ctx.now) }))
      .filter((x): x is { c: ContactLite; days: number; age: number | null } => x.days != null && x.days <= windowDays)
      .sort((a, b) => a.days - b.days);

    if (upcoming.length === 0) {
      return listResult([], `No birthdays in the next ${windowDays} days.`);
    }

    const rows: ResultRow[] = upcoming.slice(0, 40).map(({ c, days, age }) => {
      const when = days === 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`;
      return {
        id: c.id,
        href: c.household_id ? `/customers/${c.household_id}` : "/customers",
        title: [c.first_name, c.last_name].filter(Boolean).join(" ") || "Contact",
        subtitle: [
          `birthday ${when}${age ? ` (turning ${age})` : ""}`,
          c.household_id ? nameById.get(c.household_id) : null,
        ].filter(Boolean).join(" · "),
        badges: days === 0 ? ["Today"] : [],
      };
    });

    const soon = upcoming.filter((x) => x.days <= 7).length;
    const signals: Signal[] = [
      {
        kind: "upcoming_birthdays",
        detail: `${upcoming.length} birthday${upcoming.length === 1 ? "" : "s"} in the next ${windowDays} days` + (soon ? `, ${soon} within a week` : ""),
        severity: "opportunity",
      },
    ];

    const summary = `${upcoming.length} birthday${upcoming.length === 1 ? "" : "s"} in the next ${windowDays} days.`;
    return listResult(rows, summary, signals, false);
  },
};
