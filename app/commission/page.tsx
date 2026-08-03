/**
 * Commission — /commission
 *
 * The screen that answers "what did we earn, and who still owes us?".
 *
 * Every other money surface in this CRM shows turnover: the holiday price,
 * which is the customer's money passing through. This one shows the agency's
 * income, and the part of it that is late.
 *
 * Only bookings can earn commission, so enquiries and quotes are not here.
 * Cancelled trips are excluded too — there is nothing to be paid on them.
 *
 * The numbers come from lib/commission/calc.ts, which refuses to invent a
 * rate. Where a booking has no rate recorded anywhere it is counted as
 * unknown and named as such, because a total that quietly leaves bookings out
 * is worse than no total at all.
 */

import { Topbar } from "@/components/layout/topbar";
import { createClient } from "@/lib/supabase/server";
import { requireAgencyId } from "@/lib/auth/session";
import { CommissionView, type CommissionRow, type SupplierRow } from "./commission-view";
import {
  summarise,
  chaseList,
  commissionFor,
  ageingOf,
  dueDateFor,
  type CommissionTrip,
  type CommissionSupplier,
} from "@/lib/commission/calc";

export const dynamic = "force-dynamic";

/** Stages that can earn commission. A cancelled trip earns nothing. */
const EARNING_STAGES = ["booked", "pre_departure", "travelling", "returned"];

/** A safety bound on the aggregate, far above any real agency's booked book. */
const COMMISSION_ROW_GUARD = 20000;

export default async function CommissionPage() {
  const supabase = createClient();
  const agencyId = await requireAgencyId();

  const [{ data: tripRows, error: tripErr }, { data: supplierRows }, { data: households }] =
    await Promise.all([
      supabase
        .from("trips")
        .select(
          "id, household_id, destination, depart_date, return_date, total_value, stage, supplier_id, commission_rate, commission_amount, commission_status, commission_due_at, commission_received_at, commission_note"
        )
        .eq("agency_id", agencyId)
        .in("stage", EARNING_STAGES)
        // The whole earning-stage set, not a recent slice: unpaid commission
        // sits on OLD bookings, which a "newest 500" cut would silently drop,
        // understating the very Overdue figure the chase list exists to show.
        // The bound is a runaway guard, not a business limit; if a book of
        // customers ever exceeds it the view says so rather than quietly lying.
        .order("depart_date", { ascending: false, nullsFirst: false })
        .limit(COMMISSION_ROW_GUARD),
      supabase
        .from("suppliers")
        .select("id, name, category, default_commission_rate, payment_terms_days")
        .eq("agency_id", agencyId)
        .order("name"),
      supabase.from("households").select("id, display_name").eq("agency_id", agencyId),
    ]);

  // The columns arrive with the migration; without it the page says so
  // rather than rendering a screen of blanks.
  const migrationMissing = Boolean(tripErr && /commission/.test(tripErr.message ?? ""));

  const nameById = new Map(
    ((households ?? []) as { id: string; display_name: string }[]).map((h) => [h.id, h.display_name])
  );

  const suppliers: SupplierRow[] = ((supplierRows ?? []) as SupplierRow[]).map((s) => ({
    id: s.id,
    name: s.name,
    category: s.category ?? null,
    default_commission_rate: s.default_commission_rate ?? null,
    payment_terms_days: s.payment_terms_days ?? null,
  }));

  const supplierMap = new Map<string, CommissionSupplier>(
    suppliers.map((s) => [
      s.id,
      {
        id: s.id,
        name: s.name,
        defaultCommissionRate: s.default_commission_rate,
        paymentTermsDays: s.payment_terms_days,
      },
    ])
  );

  type Row = {
    id: string;
    household_id: string;
    destination: string | null;
    depart_date: string | null;
    return_date: string | null;
    total_value: number | null;
    stage: string;
    supplier_id: string | null;
    commission_rate: number | null;
    commission_amount: number | null;
    commission_status: "expected" | "invoiced" | "received" | "written_off";
    commission_due_at: string | null;
    commission_received_at: string | null;
    commission_note: string | null;
  };

  const trips = (tripRows ?? []) as Row[];

  const asCommissionTrip = (t: Row): CommissionTrip => ({
    id: t.id,
    totalValue: t.total_value,
    supplierId: t.supplier_id,
    commissionRate: t.commission_rate,
    commissionAmount: t.commission_amount,
    status: t.commission_status,
    dueAt: t.commission_due_at,
    receivedAt: t.commission_received_at,
    departDate: t.depart_date,
    returnDate: t.return_date,
  });

  const now = new Date();
  const summary = summarise(trips.map(asCommissionTrip), supplierMap, now);
  const chases = chaseList(trips.map(asCommissionTrip), supplierMap, now);

  // Everything the table needs, computed once on the server: the amount, how
  // we know it, when it is due and how late it is.
  const rows: CommissionRow[] = trips.map((t) => {
    const ct = asCommissionTrip(t);
    const supplier = t.supplier_id ? supplierMap.get(t.supplier_id) ?? null : null;
    const value = commissionFor(ct, supplier);
    const due = dueDateFor(ct, supplier);
    const ageing = ageingOf(ct, supplier, now);

    return {
      id: t.id,
      householdId: t.household_id,
      customer: nameById.get(t.household_id) ?? "Unknown customer",
      destination: t.destination,
      departDate: t.depart_date,
      totalValue: t.total_value,
      supplierId: t.supplier_id,
      rate: t.commission_rate,
      amount: t.commission_amount,
      status: t.commission_status,
      dueAt: t.commission_due_at,
      receivedAt: t.commission_received_at,
      note: t.commission_note,
      computed: value.amount,
      computedFrom: value.source,
      computedReason: value.reason,
      dueDate: due.date,
      dueReason: due.reason,
      ageingState: ageing.state,
      ageingLabel: ageing.label,
    };
  });

  return (
    <>
      <Topbar title="Commission" />
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
            The commission columns aren&apos;t in the database yet. Run{" "}
            <code style={{ fontSize: 12 }}>supabase/migrations/20260801160000_commission.sql</code>{" "}
            in the Supabase SQL editor and refresh.
          </div>
        </div>
      ) : (
        <CommissionView rows={rows} suppliers={suppliers} summary={summary} chases={chases} truncated={trips.length >= COMMISSION_ROW_GUARD} />
      )}
    </>
  );
}
