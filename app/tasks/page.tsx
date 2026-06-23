/**
 * Tasks — the work queue. /tasks
 *
 * Server Component. Loads every task for the agency (open and resolved) plus the
 * households they belong to, and hands them to a client view that owns the
 * status filter and the complete / snooze / reopen actions.
 *
 * Journeys write tasks here (source 'journey'), so this screen is where Luna's
 * auto-pilot output actually gets worked. The empty state says as much.
 */

import { Topbar } from "@/components/layout/topbar";
import { createClient, AGENCY_ID } from "@/lib/supabase/server";
import { CheckSquareIcon } from "@/components/ui/icons";
import { TasksView, type TaskRow } from "./tasks-view";

export const dynamic = "force-dynamic";

export default async function TasksPage() {
  const supabase = createClient();

  const [{ data: taskRows }, { data: households }] = await Promise.all([
    supabase
      .from("tasks")
      .select(
        "id, household_id, trip_id, title, description, status, priority, due_at, completed_at, source, source_meta, created_at"
      )
      .eq("agency_id", AGENCY_ID)
      .order("due_at", { ascending: true, nullsFirst: false }),
    supabase.from("households").select("id, display_name").eq("agency_id", AGENCY_ID),
  ]);

  const tasks = (taskRows ?? []) as TaskRow[];
  const nameById = Object.fromEntries(
    (households ?? []).map((h: { id: string; display_name: string }) => [h.id, h.display_name])
  );

  return (
    <>
      <Topbar
        title="Tasks"
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
            <CheckSquareIcon width={12} height={12} style={{ color: "var(--tg-accent-dark)" }} />
            Follow-ups, reminders and journey actions
          </span>
        }
      />
      <TasksView tasks={tasks} nameById={nameById} />
    </>
  );
}
