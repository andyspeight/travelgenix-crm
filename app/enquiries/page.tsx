/**
 * Enquiries — the front door. /enquiries
 *
 * Server Component. Loads every enquiry for the agency plus household names
 * for the linked ones, and hands them to the client view that owns the status
 * tabs, the first-response clocks and the respond / convert / close actions.
 *
 * If the enquiries table doesn't exist yet (migration not run), the page says
 * exactly that instead of crashing.
 */

import { Topbar } from "@/components/layout/topbar";
import { createClient, AGENCY_ID } from "@/lib/supabase/server";
import { MessageIcon } from "@/components/ui/icons";
import type { Enquiry } from "@/lib/supabase/types";
import { EnquiriesView } from "./enquiries-view";
import { emailConfigured } from "@/lib/email/brevo";
import { NewEnquiry } from "./new-enquiry";

export const dynamic = "force-dynamic";

export default async function EnquiriesPage() {
  const supabase = createClient();

  const [{ data: enquiryRows, error: enqErr }, { data: households }] = await Promise.all([
    supabase
      .from("enquiries")
      .select("*")
      .eq("agency_id", AGENCY_ID)
      .order("received_at", { ascending: false })
      .limit(500),
    supabase.from("households").select("id, display_name").eq("agency_id", AGENCY_ID),
  ]);

  const migrationMissing = Boolean(
    enqErr && /enquiries/.test(enqErr.message ?? "")
  );

  const enquiries = (enquiryRows ?? []) as Enquiry[];
  const nameById = Object.fromEntries(
    (households ?? []).map((h: { id: string; display_name: string }) => [h.id, h.display_name])
  );

  return (
    <>
      <Topbar
        title="Enquiries"
        actions={
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span
              style={{
                fontSize: 11.5,
                color: "var(--text-muted)",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <MessageIcon width={12} height={12} style={{ color: "var(--tg-accent-dark)" }} />
              Every request answered on the clock
            </span>
            <NewEnquiry />
          </div>
        }
      />
      {migrationMissing ? (
        <div style={{ padding: 32 }}>
          <div
            style={{
              maxWidth: 520,
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 12,
              padding: 24,
              fontSize: 13.5,
              color: "var(--text-muted)",
              lineHeight: 1.6,
            }}
          >
            <div style={{ fontWeight: 700, color: "var(--text)", marginBottom: 6 }}>
              One migration to run
            </div>
            The enquiries table isn&apos;t in the database yet. Run{" "}
            <code style={{ fontSize: 12 }}>
              supabase/migrations/20260723090000_enquiries_events.sql
            </code>{" "}
            in the Supabase SQL editor and refresh this page.
          </div>
        </div>
      ) : (
        <EnquiriesView enquiries={enquiries} nameById={nameById} emailLive={emailConfigured()} />
      )}
    </>
  );
}
