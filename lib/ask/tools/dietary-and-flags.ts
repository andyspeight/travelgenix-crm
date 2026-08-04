/**
 * Query tool: dietary_and_flags
 *
 * Answers "any allergies on the trips departing this week?", "dietary needs for
 * the Crete group?", "who has a mobility flag travelling soon?". Surfaces the
 * dietary requirements and safety flags recorded on travellers who are about to
 * depart (or a named customer/destination). Genuine duty-of-care value before a
 * trip leaves.
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
  dietary: string | null;
  flags: string[] | null;
};
type TripLite = { household_id: string | null; destination: string | null; depart_date: string | null; stage: string | null };

export const dietaryAndFlags: QueryTool = {
  name: "dietary_and_flags",
  description:
    "List dietary requirements and safety flags (allergies, mobility, unaccompanied minor, etc.) for travellers who are departing soon, or for a named customer or destination. Use for 'any allergies on trips this week', 'dietary needs for the Crete group', 'who has a mobility flag travelling soon', 'special requirements before departure'.",
  examples: [
    "Any allergies on the trips departing this week?",
    "Dietary needs for the Crete group",
    "Who has a mobility flag travelling soon?",
    "Special requirements for upcoming departures",
    "Dietary requirements for the Thompsons",
  ],
  params: [
    { name: "customer", type: "string", required: false, description: "Optional customer/household name or destination to scope to." },
    { name: "days", type: "number", required: false, description: "Departures window in days when no customer is given (default 30)." },
  ],
  run: async (args, ctx): Promise<QueryResult> => {
    const windowDays = args.days != null && !Number.isNaN(Number(args.days)) ? Math.min(Math.max(Number(args.days), 1), 180) : 30;
    const query = typeof args.customer === "string" ? args.customer.trim().toLowerCase() : "";

    const [{ data: contactRows }, { data: tripRows }, { data: households }] = await Promise.all([
      ctx.db.from("contacts").select("id, household_id, first_name, last_name, dietary, flags").eq("agency_id", ctx.agencyId),
      ctx.db.from("trips").select("household_id, destination, depart_date, stage").eq("agency_id", ctx.agencyId),
      ctx.db.from("households").select("id, display_name").eq("agency_id", ctx.agencyId),
    ]);

    const nameById = new Map<string, string>(
      ((households ?? []) as { id: string; display_name: string }[]).map((h) => [h.id, h.display_name])
    );
    const trips = (tripRows ?? []) as TripLite[];

    // Which households are "in scope": a named customer/destination, else those
    // with a departure inside the window.
    const nowMs = ctx.now.getTime();
    const horizon = nowMs + windowDays * 86_400_000;
    const scope = new Map<string, string | null>(); // householdId -> destination for context
    for (const t of trips) {
      if (!t.household_id || t.stage === "cancelled" || t.stage === "returned") continue;
      if (query) {
        const hhName = (nameById.get(t.household_id) ?? "").toLowerCase();
        const dest = (t.destination ?? "").toLowerCase();
        if (hhName.includes(query) || dest.includes(query)) scope.set(t.household_id, t.destination);
      } else {
        if (!t.depart_date) continue;
        const dep = Date.parse(`${t.depart_date.slice(0, 10)}T00:00:00`);
        if (!Number.isNaN(dep) && dep >= nowMs && dep <= horizon) scope.set(t.household_id, t.destination);
      }
    }
    // A named customer with no upcoming trip should still return their needs.
    if (query) {
      for (const [id, name] of nameById) {
        if (name.toLowerCase().includes(query)) scope.set(id, scope.get(id) ?? null);
      }
    }

    const rows: ResultRow[] = [];
    for (const c of (contactRows ?? []) as ContactLite[]) {
      if (!c.household_id || !scope.has(c.household_id)) continue;
      const flags = (c.flags ?? []).filter(Boolean);
      const hasDietary = Boolean(c.dietary && c.dietary.trim());
      if (!hasDietary && flags.length === 0) continue;
      const parts = [
        hasDietary ? `dietary: ${c.dietary!.trim()}` : null,
        flags.length ? `flags: ${flags.join(", ")}` : null,
      ].filter(Boolean);
      rows.push({
        id: c.id,
        href: `/customers/${c.household_id}`,
        title: [c.first_name, c.last_name].filter(Boolean).join(" ") || "Traveller",
        subtitle: [parts.join(" · "), nameById.get(c.household_id), scope.get(c.household_id)].filter(Boolean).join(" · "),
        badges: flags.length ? ["Flag"] : [],
      });
    }

    if (rows.length === 0) {
      const where = query ? `for “${(args.customer as string).trim()}”` : `on departures in the next ${windowDays} days`;
      return listResult([], `No dietary requirements or flags recorded ${where}.`);
    }

    const withFlags = rows.filter((r) => (r.badges ?? []).includes("Flag")).length;
    const signals: Signal[] = [
      {
        kind: "dietary_flags",
        detail: `${rows.length} traveller${rows.length === 1 ? "" : "s"} with dietary needs or flags` + (withFlags ? `, ${withFlags} carrying a safety flag` : ""),
        severity: withFlags ? "warning" : "info",
      },
    ];

    const summary = `${rows.length} traveller${rows.length === 1 ? "" : "s"} with recorded dietary needs or flags.`;
    return listResult(rows, summary, signals, false);
  },
};
