/**
 * Running sequences — enrol, then decide and act on every live chase.
 *
 * Two passes each night, in this order:
 *
 *   1. ENROL. New candidates matching the sequence's trigger. Reuses the
 *      journeys matcher rather than growing a second one, so a trigger
 *      behaves identically whether a journey or a sequence uses it.
 *
 *   2. DECIDE. EVERY active enrolment is evaluated, not only those with a
 *      step due. That is the whole point: a reply on day 2 must stop the
 *      chase before day 3 comes round, and skipping "nothing due" enrolments
 *      would mean noticing the reply only as we prepared to ignore it.
 *
 * Stop signals are gathered in bulk per agency, then handed to the pure
 * engine. Nothing here decides policy; it only fetches facts and carries out
 * the verdict.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  evaluateJourney,
  buildLastContactMap,
  type Journey,
  type EvalContext,
} from "@/lib/journeys/engine";
import { decideNext, type SequenceStep, type StopSignals } from "@/lib/sequences/engine";
import { sendCrmEmail } from "@/lib/email/send";
import type { Household, Trip, Contact, Quote } from "@/lib/supabase/types";

export type SequenceRunResult = {
  enrolled: number;
  sent: number;
  queued: number;
  stopped: number;
  completed: number;
  error?: string;
};

type SequenceRow = {
  id: string;
  name: string;
  trigger_kind: string;
  trigger_config: Record<string, unknown>;
  auto_send: boolean;
  is_active: boolean;
};

type EnrolmentRow = {
  id: string;
  sequence_id: string;
  household_id: string | null;
  trip_id: string | null;
  quote_id: string | null;
  enrolled_at: string;
  steps_sent: number;
  last_sent_at: string | null;
  status: "active" | "completed" | "stopped";
};

/** Fill the template tokens a step body may use. */
const fill = (text: string, name: string): string =>
  text.replaceAll("{{name}}", name).replaceAll("{{customer}}", name);

export async function runSequencesForAgency(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  agencyId: string,
  now: Date = new Date()
): Promise<SequenceRunResult> {
  const out: SequenceRunResult = { enrolled: 0, sent: 0, queued: 0, stopped: 0, completed: 0 };

  const { data: seqRows, error: seqErr } = await supabase
    .from("sequences")
    .select("id, name, trigger_kind, trigger_config, auto_send, is_active")
    .eq("agency_id", agencyId)
    .eq("is_active", true);
  if (seqErr) return { ...out, error: seqErr.message };

  const sequences = (seqRows ?? []) as SequenceRow[];
  if (sequences.length === 0) return out;

  const { data: stepRows } = await supabase
    .from("sequence_steps")
    .select("sequence_id, step_number, delay_days, subject, body")
    .in("sequence_id", sequences.map((s) => s.id));

  const stepsBySequence = new Map<string, SequenceStep[]>();
  for (const r of (stepRows ?? []) as {
    sequence_id: string;
    step_number: number;
    delay_days: number;
    subject: string;
    body: string;
  }[]) {
    const list = stepsBySequence.get(r.sequence_id) ?? [];
    list.push({
      stepNumber: r.step_number,
      delayDays: r.delay_days,
      subject: r.subject,
      body: r.body,
    });
    stepsBySequence.set(r.sequence_id, list);
  }

  // ─── The agency's data, once ──────────────────────────────────────────
  const [{ data: households }, { data: trips }, { data: contacts }, { data: ixRows }, { data: quoteRows }] =
    await Promise.all([
      supabase
        .from("households")
        .select("id, display_name, customer_since, last_booking_at, trips_count")
        .eq("agency_id", agencyId),
      supabase
        .from("trips")
        .select("id, household_id, stage, destination, depart_date, return_date")
        .eq("agency_id", agencyId),
      supabase
        .from("contacts")
        .select("id, household_id, first_name, last_name, email, role, passport_expiry")
        .eq("agency_id", agencyId),
      supabase
        .from("interactions")
        .select("household_id, occurred_at, direction, metadata")
        .eq("agency_id", agencyId),
      supabase
        .from("quotes")
        .select("id, trip_id, household_id, status, sent_at, total_price, customer_response, view_count")
        .eq("agency_id", agencyId),
    ]);

  const hh = (households ?? []) as Household[];
  const allInteractions = (ixRows ?? []) as {
    household_id: string | null;
    occurred_at: string;
    direction: string;
    metadata?: Record<string, unknown> | null;
  }[];
  const allQuotes = (quoteRows ?? []) as Quote[];

  const ctx: EvalContext = {
    now,
    households: hh,
    trips: (trips ?? []) as Trip[],
    contacts: (contacts ?? []) as Contact[],
    lastContactByHousehold: buildLastContactMap(allInteractions),
    // The matcher only wants live quotes.
    quotes: allQuotes.filter((q) => q.status === "sent" || q.status === "viewed"),
  };

  const nameById = new Map(hh.map((h) => [h.id, h.display_name]));
  const leadByHousehold = new Map<string, Contact>();
  for (const c of (contacts ?? []) as Contact[]) {
    if (c.email && (c.role === "lead" || !leadByHousehold.has(c.household_id))) {
      leadByHousehold.set(c.household_id, c);
    }
  }

  // Inbound messages, newest per household — our "they replied" signal.
  //
  // An out-of-office is skipped. It is a machine confirming nobody is
  // reading, and stopping a chase on it would be exactly backwards: the one
  // person we know has not seen the email would be the one we stop chasing.
  const lastInboundByHousehold = new Map<string, string>();
  for (const ix of allInteractions) {
    if (ix.direction !== "inbound" || !ix.household_id) continue;
    if (ix.metadata?.auto_reply === true) continue;
    const seen = lastInboundByHousehold.get(ix.household_id);
    if (!seen || ix.occurred_at > seen) lastInboundByHousehold.set(ix.household_id, ix.occurred_at);
  }

  const quoteById = new Map(allQuotes.map((q) => [q.id, q]));
  // The matcher identifies a quote chase by its trip, so map trip -> live
  // quote to record WHICH quote an enrolment is about. Without it we could
  // not tell later that the quote had been accepted.
  const liveQuoteByTrip = new Map<string, Quote>();
  for (const q of allQuotes) {
    if (!q.trip_id) continue;
    if (q.status === "sent" || q.status === "viewed") liveQuoteByTrip.set(q.trip_id, q);
  }

  const { data: suppressedRows } = await supabase
    .from("email_suppressions")
    .select("email")
    .eq("agency_id", agencyId);
  const suppressed = new Set(
    ((suppressedRows ?? []) as { email: string }[]).map((r) => r.email.toLowerCase())
  );

  // ─── Pass 1: enrol new candidates ─────────────────────────────────────
  const { data: existingRows } = await supabase
    .from("sequence_enrolments")
    .select("id, sequence_id, household_id, trip_id, quote_id, enrolled_at, steps_sent, last_sent_at, status")
    .eq("agency_id", agencyId);
  const enrolments = (existingRows ?? []) as EnrolmentRow[];

  const enrolledKey = new Set(
    enrolments.map((e) => `${e.sequence_id}:${e.household_id ?? ""}:${e.quote_id ?? ""}:${e.trip_id ?? ""}`)
  );

  const newEnrolments: Record<string, unknown>[] = [];
  for (const seq of sequences) {
    // The matcher speaks Journey; a sequence carries the same trigger fields.
    const asJourney = {
      id: seq.id,
      agency_id: agencyId,
      name: seq.name,
      trigger_kind: seq.trigger_kind,
      trigger_config: seq.trigger_config,
      is_active: true,
    } as unknown as Journey;

    for (const cand of evaluateJourney(asJourney, ctx)) {
      const quoteId = cand.trip_id ? liveQuoteByTrip.get(cand.trip_id)?.id ?? null : null;
      const key = `${seq.id}:${cand.household_id ?? ""}:${quoteId ?? ""}:${cand.trip_id ?? ""}`;
      if (enrolledKey.has(key)) continue;
      enrolledKey.add(key);
      newEnrolments.push({
        agency_id: agencyId,
        sequence_id: seq.id,
        household_id: cand.household_id,
        trip_id: cand.trip_id,
        quote_id: quoteId,
        enrolled_at: now.toISOString(),
        steps_sent: 0,
        status: "active",
      });
    }
  }

  if (newEnrolments.length) {
    const { data: inserted } = await supabase
      .from("sequence_enrolments")
      .insert(newEnrolments)
      .select("id, sequence_id, household_id, trip_id, quote_id, enrolled_at, steps_sent, last_sent_at, status");
    out.enrolled = (inserted ?? []).length;
    enrolments.push(...((inserted ?? []) as EnrolmentRow[]));
  }

  // ─── Pass 2: decide on every active enrolment ─────────────────────────
  const sequenceById = new Map(sequences.map((s) => [s.id, s]));

  for (const e of enrolments) {
    if (e.status !== "active") continue;
    const seq = sequenceById.get(e.sequence_id);
    if (!seq) continue; // sequence paused or deleted since

    const lead = e.household_id ? leadByHousehold.get(e.household_id) : undefined;
    const quote = e.quote_id ? quoteById.get(e.quote_id) : undefined;

    // Facts, not judgements — the engine decides what they mean.
    const replied = e.household_id ? lastInboundByHousehold.get(e.household_id) : undefined;
    const signals: StopSignals = {
      repliedAt: replied && replied > e.enrolled_at ? replied : null,
      resolved: quote
        ? quote.status === "accepted"
          ? { at: now.toISOString(), what: "the quote was accepted" }
          : quote.status === "declined"
            ? { at: now.toISOString(), what: "the quote was declined" }
            : quote.customer_response
              ? { at: now.toISOString(), what: "the customer responded to the quote" }
              : null
        : null,
      undeliverable: lead?.email ? suppressed.has(lead.email.toLowerCase()) : false,
    };

    const decision = decideNext({
      enrolment: {
        enrolledAt: e.enrolled_at,
        stepsSent: e.steps_sent,
        lastSentAt: e.last_sent_at,
        status: e.status,
      },
      steps: stepsBySequence.get(e.sequence_id) ?? [],
      signals,
      purpose: "operational",
      now,
    });

    if (decision.action === "wait") continue;

    if (decision.action === "stop" || decision.action === "complete") {
      await supabase
        .from("sequence_enrolments")
        .update({
          status: decision.action === "stop" ? "stopped" : "completed",
          stop_reason: decision.reason,
          stopped_at: now.toISOString(),
        })
        .eq("id", e.id);
      if (decision.action === "stop") out.stopped++;
      else out.completed++;
      continue;
    }

    // ─── Send (or queue for review) ─────────────────────────────────────
    const name = e.household_id ? nameById.get(e.household_id) ?? "there" : "there";
    const subject = fill(decision.step.subject, name);
    const body = fill(decision.step.body, name);

    if (seq.auto_send && lead?.email) {
      const outcome = await sendCrmEmail({
        supabase,
        agencyId,
        contactId: lead.id,
        householdId: e.household_id,
        subject,
        body,
        purpose: "operational",
        context: `sequence:${seq.name}`,
      });

      if (outcome.ok) {
        await supabase
          .from("sequence_enrolments")
          .update({ steps_sent: e.steps_sent + 1, last_sent_at: now.toISOString() })
          .eq("id", e.id);
        out.sent++;
      } else {
        // A refusal is a reason to stop the whole chase, not to retry it
        // nightly: consent gone, address dead, nothing configured. Record
        // the provider's own words so an agent can see why.
        await supabase
          .from("sequence_enrolments")
          .update({
            status: "stopped",
            stop_reason: outcome.error,
            stopped_at: now.toISOString(),
          })
          .eq("id", e.id);
        out.stopped++;
      }
      continue;
    }

    // Review mode (the default): the draft becomes a task in the queue the
    // agent already works, so a sequence never sends unattended by accident.
    await supabase.from("tasks").insert({
      agency_id: agencyId,
      household_id: e.household_id,
      trip_id: e.trip_id,
      title: `Send: ${subject}`,
      description: `${seq.name} — step ${decision.step.stepNumber}.\n\n${body}`,
      status: "open",
      source: "sequence",
      source_meta: { sequence_id: seq.id, sequence: seq.name, step: decision.step.stepNumber },
    });
    await supabase
      .from("sequence_enrolments")
      .update({ steps_sent: e.steps_sent + 1, last_sent_at: now.toISOString() })
      .eq("id", e.id);
    out.queued++;
  }

  return out;
}
