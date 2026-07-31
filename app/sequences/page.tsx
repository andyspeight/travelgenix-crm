/**
 * Sequences — /sequences
 *
 * Server component. Loads each sequence with its steps and a count of what
 * has happened to the people on it, plus the enrolment list itself.
 *
 * If the migration hasn't been run the page says so plainly rather than
 * crashing, in keeping with every other feature that landed after the
 * original schema.
 */

import { Topbar } from "@/components/layout/topbar";
import { createClient } from "@/lib/supabase/server";
import { requireAgencyId } from "@/lib/auth/session";
import { SequencesView, type SequenceCard, type EnrolmentRow } from "./sequences-view";
import { SendIcon } from "@/components/ui/icons";

export const dynamic = "force-dynamic";

export default async function SequencesPage() {
  const supabase = createClient();
  const agencyId = await requireAgencyId();

  const { data: seqRows, error } = await supabase
    .from("sequences")
    .select("id, name, description, is_active, auto_send")
    .eq("agency_id", agencyId)
    .order("created_at");

  const migrationMissing = Boolean(error && /sequences/.test(error.message ?? ""));

  const sequences = (seqRows ?? []) as {
    id: string;
    name: string;
    description: string | null;
    is_active: boolean;
    auto_send: boolean;
  }[];

  const ids = sequences.map((s) => s.id);

  const [{ data: stepRows }, { data: enrolRows }, { data: households }] = await Promise.all([
    ids.length
      ? supabase
          .from("sequence_steps")
          .select("sequence_id, step_number, delay_days, subject")
          .in("sequence_id", ids)
          .order("step_number")
      : Promise.resolve({ data: [] as never[] }),
    supabase
      .from("sequence_enrolments")
      .select("id, sequence_id, household_id, status, steps_sent, stop_reason, enrolled_at")
      .eq("agency_id", agencyId)
      .order("enrolled_at", { ascending: false })
      .limit(120),
    supabase.from("households").select("id, display_name").eq("agency_id", agencyId),
  ]);

  const nameById = new Map(
    ((households ?? []) as { id: string; display_name: string }[]).map((h) => [h.id, h.display_name])
  );

  const stepsBySequence = new Map<string, { stepNumber: number; delayDays: number; subject: string }[]>();
  for (const s of (stepRows ?? []) as {
    sequence_id: string;
    step_number: number;
    delay_days: number;
    subject: string;
  }[]) {
    const list = stepsBySequence.get(s.sequence_id) ?? [];
    list.push({ stepNumber: s.step_number, delayDays: s.delay_days, subject: s.subject });
    stepsBySequence.set(s.sequence_id, list);
  }

  const enrolAll = (enrolRows ?? []) as {
    id: string;
    sequence_id: string;
    household_id: string | null;
    status: "active" | "completed" | "stopped";
    steps_sent: number;
    stop_reason: string | null;
    enrolled_at: string;
  }[];

  const seqNameById = new Map(sequences.map((s) => [s.id, s.name]));

  const cards: SequenceCard[] = sequences.map((s) => {
    const mine = enrolAll.filter((e) => e.sequence_id === s.id);
    return {
      id: s.id,
      name: s.name,
      description: s.description,
      isActive: s.is_active,
      autoSend: s.auto_send,
      steps: stepsBySequence.get(s.id) ?? [],
      active: mine.filter((e) => e.status === "active").length,
      stopped: mine.filter((e) => e.status === "stopped").length,
      completed: mine.filter((e) => e.status === "completed").length,
    };
  });

  const enrolments: EnrolmentRow[] = enrolAll.map((e) => ({
    id: e.id,
    sequenceName: seqNameById.get(e.sequence_id) ?? "Sequence",
    household: e.household_id ? nameById.get(e.household_id) ?? null : null,
    householdId: e.household_id,
    status: e.status,
    stepsSent: e.steps_sent,
    totalSteps: (stepsBySequence.get(e.sequence_id) ?? []).length,
    stopReason: e.stop_reason,
    enrolledAt: e.enrolled_at,
  }));

  return (
    <>
      <Topbar
        title="Sequences"
        actions={
          <span
            style={{
              fontSize: 11.5,
              color: "var(--text-muted)",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <SendIcon width={12} height={12} style={{ color: "var(--tg-accent-dark)" }} />
            A chase that stops when it should
          </span>
        }
      />
      {migrationMissing ? (
        <div style={{ padding: 28, maxWidth: 700, margin: "0 auto" }}>
          <div
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 12,
              padding: 20,
              fontSize: 13.5,
              color: "var(--text-muted)",
              lineHeight: 1.6,
            }}
          >
            <strong style={{ color: "var(--text)" }}>Run the sequences migration.</strong>{" "}
            <code className="mono" style={{ fontSize: 12 }}>
              supabase/migrations/20260731170000_sequences.sql
            </code>{" "}
            hasn&apos;t been applied to this database yet. Everything else keeps working.
          </div>
        </div>
      ) : (
        <SequencesView
          cards={cards}
          enrolments={enrolments}
          installed={sequences.length > 0}
        />
      )}
    </>
  );
}
