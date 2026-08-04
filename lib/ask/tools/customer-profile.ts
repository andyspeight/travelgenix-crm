/**
 * Query tool: customer_profile
 *
 * Answers "tell me about the Thompsons", "who is Sarah Thompson", "what do we
 * know about the Patel family". Finds a household by (partial) name and returns
 * a profile: who they are, value, history, upcoming travel — with deterministic
 * signals (passport risk, gone quiet, VIP, imminent departure) for the insight
 * layer. If several households match, it lists them so the user can pick.
 */

import {
  type QueryTool,
  type QueryResult,
  type ResultRow,
  type Signal,
  listResult,
  emptyResult,
} from "../contract";
import { computeRisk } from "@/lib/scoring/customer";
import type { Contact, Trip, Household } from "@/lib/supabase/types";

function fmtMoney(n: number | null): string {
  if (n == null) return "£0";
  if (n >= 1000) return `£${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  return `£${Math.round(n).toLocaleString("en-GB")}`;
}

function fmtDate(s: string | null): string {
  if (!s) return "no date";
  return new Date(s).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export const customerProfile: QueryTool = {
  name: "customer_profile",
  description:
    "Look up ONE customer/household OR an individual traveller by name and summarise their status: who they are, lifetime value, trip history, upcoming travel, and risks like passport validity. Resolves a named passenger too (including a child or a partner with a different surname), not just the household name. Use for 'tell me about X', 'who are the Ys', 'what's the status of traveller Z', 'when did X last travel'.",
  examples: [
    "Tell me about Sarah Thompson",
    "Who are the Patels?",
    "What's the status of Oliver Thompson?",
    "What do we know about the Davies family?",
    "When did Margaret Doyle last travel?",
  ],
  params: [
    {
      name: "name",
      type: "string",
      required: true,
      description: "The customer, family or household name to look up, e.g. 'Thompson', 'Sarah Thompson', 'the Patels'. Strip words like 'the' and 'family'.",
    },
  ],
  run: async (args, ctx): Promise<QueryResult> => {
    const raw = String(args.name ?? "").trim();
    // Strip filler the router may pass through ("the", "family", "household").
    const name = raw.replace(/\b(the|family|household)\b/gi, "").replace(/\s+/g, " ").trim();
    if (!name) return emptyResult("Which customer? Give me a name to look up.");

    const { data } = await ctx.db
      .from("households")
      .select("*")
      .eq("agency_id", ctx.agencyId)
      .ilike("display_name", `%${name}%`)
      .limit(6);

    let matches = (data ?? []) as Household[];

    // Nothing on the household name? Try a traveller's own name — a child, or a
    // partner whose surname isn't in the household label — and resolve their
    // household(s). Each token is matched against first or last name.
    if (matches.length === 0) {
      const tokens = name.toLowerCase().split(/\s+/).map((t) => t.trim()).filter(Boolean);
      if (tokens.length) {
        const { data: contactHits } = await ctx.db
          .from("contacts")
          .select("household_id, first_name, last_name")
          .eq("agency_id", ctx.agencyId)
          .limit(2000);
        const ids = Array.from(
          new Set(
            ((contactHits ?? []) as { household_id: string | null; first_name: string | null; last_name: string | null }[])
              .filter((c) => {
                const full = `${c.first_name ?? ""} ${c.last_name ?? ""}`.toLowerCase();
                return tokens.some((tk) => full.includes(tk));
              })
              .map((c) => c.household_id)
              .filter(Boolean)
          )
        ) as string[];
        if (ids.length) {
          const { data: byContact } = await ctx.db
            .from("households")
            .select("*")
            .eq("agency_id", ctx.agencyId)
            .in("id", ids.slice(0, 6));
          matches = (byContact ?? []) as Household[];
        }
      }
    }

    if (matches.length === 0) {
      return emptyResult(`No customer or traveller matching "${raw}" on file.`);
    }

    // Several matches — list them so the user can click through or re-ask.
    if (matches.length > 1) {
      const rows: ResultRow[] = matches.map((h) => ({
        id: h.id,
        href: `/customers/${h.id}`,
        title: h.display_name,
        subtitle: [h.city, fmtMoney(h.lifetime_value), `${h.trips_count ?? 0} trips`].filter(Boolean).join(" · "),
        badges: (h.tags ?? []).slice(0, 2),
      }));
      return listResult(rows, `${matches.length} customers match "${raw}". Pick one.`, [], false);
    }

    // ── One match: build the profile ────────────────────────────────────
    const hh = matches[0];
    const [{ data: contactRows }, { data: tripRows }] = await Promise.all([
      ctx.db.from("contacts").select("*").eq("household_id", hh.id),
      ctx.db.from("trips").select("*").eq("household_id", hh.id),
    ]);
    const contacts = (contactRows ?? []) as Contact[];
    const trips = (tripRows ?? []) as Trip[];

    const upcoming = trips
      .filter((t) => ["booked", "pre_departure", "travelling"].includes(t.stage) && t.depart_date)
      .sort((a, b) => (a.depart_date! < b.depart_date! ? -1 : 1));
    const past = trips
      .filter((t) => t.stage === "returned" && t.depart_date)
      .sort((a, b) => (a.depart_date! > b.depart_date! ? -1 : 1));
    const open = trips.filter((t) => t.stage === "enquiry" || t.stage === "quoted");

    const rows: ResultRow[] = [
      {
        id: hh.id,
        href: `/customers/${hh.id}`,
        title: hh.display_name,
        subtitle: [
          hh.household_type,
          hh.city,
          `customer since ${hh.customer_since ? new Date(hh.customer_since).getFullYear() : "unknown"}`,
          fmtMoney(hh.lifetime_value),
          `${hh.trips_count ?? trips.length} trips`,
        ]
          .filter(Boolean)
          .join(" · "),
        badges: (hh.tags ?? []).slice(0, 3),
      },
    ];
    for (const t of upcoming.slice(0, 2)) {
      rows.push({
        id: t.id,
        href: `/customers/${hh.id}`,
        title: `${t.stage === "travelling" ? "Away now" : "Upcoming"}: ${t.destination ?? "trip"}`,
        subtitle: [fmtDate(t.depart_date), t.occasion, t.total_value != null ? fmtMoney(t.total_value) : null].filter(Boolean).join(" · "),
      });
    }
    if (past[0]) {
      rows.push({
        id: past[0].id,
        href: `/customers/${hh.id}`,
        title: `Last trip: ${past[0].destination ?? "trip"}`,
        subtitle: [fmtDate(past[0].depart_date), past[0].occasion].filter(Boolean).join(" · "),
      });
    }

    // ── Deterministic signals ───────────────────────────────────────────
    const signals: Signal[] = [];
    const risk = computeRisk(contacts, trips);
    if (risk.level !== "Low") {
      signals.push({ kind: "risk", detail: risk.reason, severity: "warning", rowIds: [hh.id] });
    }
    if (upcoming[0]?.depart_date) {
      const days = Math.round((new Date(upcoming[0].depart_date).getTime() - ctx.now.getTime()) / 86400000);
      if (days >= 0 && days <= 14) {
        signals.push({
          kind: "imminent_departure",
          detail: `${upcoming[0].destination ?? "Their next trip"} departs in ${days} ${days === 1 ? "day" : "days"}`,
          severity: "info",
          rowIds: [upcoming[0].id],
        });
      }
    }
    if (open.length > 0) {
      signals.push({
        kind: "open_pipeline",
        detail: `${open.length} live ${open.length === 1 ? "enquiry/quote" : "enquiries/quotes"} open with them right now`,
        severity: "opportunity",
      });
    }
    if ((hh.tags ?? []).some((t) => /vip/i.test(t))) {
      signals.push({ kind: "vip", detail: "Tagged VIP", severity: "opportunity", rowIds: [hh.id] });
    }
    if (upcoming.length === 0 && open.length === 0 && hh.last_booking_at) {
      const quietDays = Math.round((ctx.now.getTime() - new Date(hh.last_booking_at).getTime()) / 86400000);
      if (quietDays > 365) {
        signals.push({
          kind: "gone_quiet",
          detail: `No booking in ${Math.round(quietDays / 30)} months and nothing upcoming, worth a re-engagement`,
          severity: "warning",
        });
      }
    }

    const summary = `${hh.display_name}: ${hh.household_type ?? "customer"} in ${hh.city ?? "unknown"}, ${fmtMoney(
      hh.lifetime_value
    )} over ${hh.trips_count ?? trips.length} trips.`;

    return listResult(rows, summary, signals, true);
  },
};
