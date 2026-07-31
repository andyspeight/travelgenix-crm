/**
 * Luna Suggest — the proactive "I noticed…" layer (blueprint §16, Suggest
 * mode). Deterministic detectors over real rows, exactly like the scoring
 * and rescue modules: every suggestion says what it noticed, why it matters
 * and what to do, and can always point at the fields that produced it.
 *
 * Enquiry clocks and quote rescue already have dedicated dashboard panels,
 * so this feed covers the patterns that had no home:
 *
 *   rebooking_window — a repeat customer is inside their own booking cadence
 *                      with nothing planned (differentiator 4)
 *   gone_quiet       — real lifetime value drifting away unattended
 *   passport_risk    — a computed risk flag on a household with travel ahead
 *   unreachable      — a customer we literally cannot contact
 *   undeliverable    — we emailed them and it bounced, so they never got it.
 *                      The screen said "sent"; the customer heard nothing.
 *
 * Pure functions, no I/O.
 */

import type { Household, Contact, Trip } from "@/lib/supabase/types";
import { computeOpportunity, computeRisk } from "@/lib/scoring/customer";

export type SuggestionKind =
  | "rebooking_window"
  | "gone_quiet"
  | "passport_risk"
  | "unreachable"
  | "undeliverable";

export type Suggestion = {
  /** Stable key, e.g. "rebooking_window:hh-id". */
  id: string;
  kind: SuggestionKind;
  /** 1 = worth knowing, 2 = act soon, 3 = act now. */
  severity: 1 | 2 | 3;
  title: string;
  reason: string;
  href: string;
  actionLabel: string;
  householdId: string;
};

const OPEN_STAGES = new Set(["enquiry", "quoted"]);
const FORWARD_STAGES = new Set(["booked", "pre_departure", "travelling"]);

const monthsSince = (iso: string, now: Date): number =>
  Math.round((now.getTime() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24 * 30));

/** A send that came back undelivered, joined to the household it was for. */
export type BouncedSend = {
  household_id: string | null;
  to_email: string;
  /** "bounce" (address is dead) or "complaint" (they marked us as spam). */
  status: string;
};

export function computeSuggestions(
  households: Household[],
  contactsByHousehold: Map<string, Contact[]>,
  tripsByHousehold: Map<string, Trip[]>,
  now: Date = new Date(),
  bouncedByHousehold: Map<string, BouncedSend> = new Map()
): Suggestion[] {
  const suggestions: Suggestion[] = [];

  for (const hh of households) {
    const trips = tripsByHousehold.get(hh.id) ?? [];
    const contacts = contactsByHousehold.get(hh.id) ?? [];
    const href = `/customers/${hh.id}`;
    const name = hh.display_name;

    const hasOpenPipeline = trips.some((t) => OPEN_STAGES.has(t.stage));
    const hasTravelAhead = trips.some(
      (t) =>
        FORWARD_STAGES.has(t.stage) &&
        (t.stage === "travelling" ||
          (t.depart_date != null && new Date(t.depart_date) >= now))
    );

    // ─── Undeliverable ──────────────────────────────────────────────
    // Top of the pile: we think we answered them and we did not. The email
    // bounced, so the customer is still waiting while the record says done.
    const bounced = bouncedByHousehold.get(hh.id);
    if (bounced) {
      const complaint = bounced.status === "complained";
      suggestions.push({
        id: `undeliverable:${hh.id}`,
        kind: "undeliverable",
        severity: 3,
        title: complaint
          ? `${name} marked your email as spam`
          : `${name} never received your email`,
        reason: complaint
          ? `${bounced.to_email} reported a message as spam, so nothing more will be sent there. Reach them another way and ask how they would like to be contacted.`
          : `${bounced.to_email} bounced — the address is not reachable. They are still waiting for a reply. Get a working address, by phone if need be.`,
        href,
        actionLabel: "Open the record",
        householdId: hh.id,
      });
    }

    // ─── Rebooking window (differentiator 4) ────────────────────────
    // Their own cadence says they're due, and nothing is on the books.
    let suggestedRebooking = false;
    if (!hasOpenPipeline && !hasTravelAhead) {
      const opp = computeOpportunity(hh, trips);
      if (opp.confidence != null && opp.confidence >= 65) {
        suggestedRebooking = true;
        suggestions.push({
          id: `rebooking_window:${hh.id}`,
          kind: "rebooking_window",
          severity: opp.confidence >= 80 ? 3 : 2,
          title: `${name} are in their booking window`,
          reason: `${opp.reason} Nothing is planned or in the pipeline.`,
          href,
          actionLabel: "Start the conversation",
          householdId: hh.id,
        });
      }
    }

    // ─── Gone quiet ─────────────────────────────────────────────────
    // Distinct from the rebooking window: these are LAPSED, past their own
    // rhythm, and worth a considered win-back rather than a routine nudge.
    if (!suggestedRebooking && !hasOpenPipeline && !hasTravelAhead && hh.last_booking_at) {
      const months = monthsSince(hh.last_booking_at, now);
      const ltv = hh.lifetime_value ?? 0;
      if (months >= 14 && ltv >= 4000) {
        suggestions.push({
          id: `gone_quiet:${hh.id}`,
          kind: "gone_quiet",
          severity: ltv >= 15000 ? 2 : 1,
          title: `${name} have gone quiet`,
          reason: `£${Math.round(ltv).toLocaleString("en-GB")} lifetime value, last booked ${months} months ago, nothing planned since.`,
          href,
          actionLabel: "Plan a win-back",
          householdId: hh.id,
        });
      }
    }

    // ─── Passport risk ──────────────────────────────────────────────
    // The same computed risk the 360 shows, surfaced without waiting for
    // someone to open the record.
    if (hasTravelAhead) {
      const risk = computeRisk(contacts, trips);
      const passportFlag = risk.flags.find((f) => /passport/i.test(f));
      if (risk.level === "High" && passportFlag) {
        suggestions.push({
          id: `passport_risk:${hh.id}`,
          kind: "passport_risk",
          severity: 3,
          title: `${name}: passport problem before travel`,
          reason: `${passportFlag}.`,
          href,
          actionLabel: "Sort it today",
          householdId: hh.id,
        });
      } else if (risk.level === "Medium" && passportFlag) {
        suggestions.push({
          id: `passport_risk:${hh.id}`,
          kind: "passport_risk",
          severity: 2,
          title: `${name}: passport check needed`,
          reason: `${passportFlag}.`,
          href,
          actionLabel: "Check with them",
          householdId: hh.id,
        });
      }
    }

    // ─── Unreachable ────────────────────────────────────────────────
    // A customer record we cannot act on is a data problem worth naming.
    if (
      contacts.length > 0 &&
      !contacts.some((c) => Boolean(c.email) || Boolean(c.phone))
    ) {
      suggestions.push({
        id: `unreachable:${hh.id}`,
        kind: "unreachable",
        severity: hasTravelAhead || hasOpenPipeline ? 2 : 1,
        title: `No way to reach ${name}`,
        reason:
          hasTravelAhead || hasOpenPipeline
            ? "No email or phone on file, and they have live travel or an open enquiry."
            : "No email or phone on any contact. Fill it in next time they're in touch.",
        href,
        actionLabel: "Add contact details",
        householdId: hh.id,
      });
    }
  }

  // Most urgent first; ties keep input (household) order.
  return suggestions.sort((a, b) => b.severity - a.severity);
}
