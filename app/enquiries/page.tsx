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
import { createClient } from "@/lib/supabase/server";
import { requireAgencyId } from "@/lib/auth/session";
import { MessageIcon } from "@/components/ui/icons";
import type { Enquiry } from "@/lib/supabase/types";
import { EnquiriesView } from "./enquiries-view";
import { enrichEnquiry, type EnrichmentFact } from "@/lib/enrich/enquiry";
import { emailConfigured } from "@/lib/email/providers";
import { NewEnquiry } from "./new-enquiry";

export const dynamic = "force-dynamic";

export default async function EnquiriesPage() {
  const supabase = createClient();
  const agencyId = await requireAgencyId();

  const [{ data: enquiryRows, error: enqErr }, { data: households }] = await Promise.all([
    supabase
      .from("enquiries")
      .select("*")
      .eq("agency_id", agencyId)
      .order("received_at", { ascending: false })
      .limit(500),
    supabase.from("households").select("id, display_name").eq("agency_id", agencyId),
  ]);

  // Passport checks need the travellers, so pull contacts for the households
  // these enquiries are linked to. An unconverted enquiry has none, and the
  // date and destination checks still work without them.
  const { data: contactRows } = await supabase
    .from("contacts")
    .select("household_id, first_name, last_name, passport_expiry")
    .eq("agency_id", agencyId);

  const migrationMissing = Boolean(
    enqErr && /enquiries/.test(enqErr.message ?? "")
  );

  const enquiries = (enquiryRows ?? []) as Enquiry[];

  const contactsByHousehold = new Map<string, { name: string; passportExpiry: string | null }[]>();
  for (const c of (contactRows ?? []) as {
    household_id: string;
    first_name: string;
    last_name: string | null;
    passport_expiry: string | null;
  }[]) {
    const list = contactsByHousehold.get(c.household_id) ?? [];
    list.push({
      name: [c.first_name, c.last_name].filter(Boolean).join(" "),
      passportExpiry: c.passport_expiry,
    });
    contactsByHousehold.set(c.household_id, list);
  }

  // What Luna worked out about each enquiry the moment it landed.
  const enrichment: Record<string, EnrichmentFact[]> = {};
  for (const e of enquiries) {
    // An enquiry stores nights, not a return date — derive it so the
    // passport checks have something to measure against.
    const returnDate =
      e.depart_date && e.duration_nights
        ? new Date(
            new Date(`${e.depart_date.slice(0, 10)}T00:00:00Z`).getTime() +
              e.duration_nights * 86_400_000
          )
            .toISOString()
            .slice(0, 10)
        : e.depart_date;

    const facts = enrichEnquiry({
      destination: e.destination,
      departDate: e.depart_date,
      returnDate,
      adults: e.adults,
      children: e.children,
      travellers: e.household_id ? contactsByHousehold.get(e.household_id) ?? [] : [],
    });
    if (facts.length) enrichment[e.id] = facts;
  }
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
        <EnquiriesView enquiries={enquiries} nameById={nameById} emailLive={emailConfigured()} enrichment={enrichment} />
      )}
    </>
  );
}
