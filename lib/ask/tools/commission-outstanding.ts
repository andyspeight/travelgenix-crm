/**
 * Query tool: commission_outstanding
 *
 * Answers "what commission is outstanding?", "overdue commission to chase",
 * "who owes us money?". Runs the SAME chase + summary maths the /commission
 * screen uses (lib/commission/calc.ts): overdue items to chase, and the total
 * still expected or invoiced. This is the agency's own money — the schema has
 * no customer-balance fields, so this is the supported "money owed" answer.
 */

import {
  type QueryTool,
  type QueryResult,
  type ResultRow,
  type Signal,
  listResult,
} from "../contract";
import {
  chaseList,
  summarise,
  money,
  type CommissionTrip,
  type CommissionSupplier,
  type CommissionStatus,
} from "@/lib/commission/calc";

type TripRow = {
  id: string;
  household_id: string | null;
  destination: string | null;
  total_value: number | null;
  supplier_id: string | null;
  commission_rate: number | null;
  commission_amount: number | null;
  commission_status: CommissionStatus;
  commission_due_at: string | null;
  commission_received_at: string | null;
  depart_date: string | null;
  return_date: string | null;
};

export const commissionOutstanding: QueryTool = {
  name: "commission_outstanding",
  description:
    "Report commission the agency is still owed by suppliers: overdue items to chase and the total expected or invoiced but not yet received. Use for 'what commission is outstanding', 'overdue commission', 'commission to chase', 'who owes us money', 'unpaid commission'. This is supplier commission, not a customer balance.",
  examples: [
    "What commission is outstanding?",
    "Overdue commission to chase",
    "Which suppliers owe us money?",
    "How much commission are we still owed?",
    "Unpaid commission",
  ],
  params: [],
  run: async (_args, ctx): Promise<QueryResult> => {
    const [{ data: tripRows }, { data: supplierRows }, { data: households }] = await Promise.all([
      ctx.db
        .from("trips")
        .select(
          "id, household_id, destination, total_value, supplier_id, commission_rate, commission_amount, commission_status, commission_due_at, commission_received_at, depart_date, return_date"
        )
        .eq("agency_id", ctx.agencyId),
      ctx.db.from("suppliers").select("id, name, default_commission_rate, payment_terms_days").eq("agency_id", ctx.agencyId),
      ctx.db.from("households").select("id, display_name").eq("agency_id", ctx.agencyId),
    ]);

    const nameById = new Map<string, string>(
      ((households ?? []) as { id: string; display_name: string }[]).map((h) => [h.id, h.display_name])
    );
    const supplierMap = new Map<string, CommissionSupplier>(
      ((supplierRows ?? []) as { id: string; name: string; default_commission_rate: number | null; payment_terms_days: number | null }[]).map((s) => [
        s.id,
        { id: s.id, name: s.name, defaultCommissionRate: s.default_commission_rate, paymentTermsDays: s.payment_terms_days },
      ])
    );

    const rowsRaw = (tripRows ?? []) as TripRow[];
    const tripMeta = new Map(rowsRaw.map((t) => [t.id, { household_id: t.household_id, destination: t.destination }]));
    const trips: CommissionTrip[] = rowsRaw.map((t) => ({
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
    }));

    const summary = summarise(trips, supplierMap, ctx.now);
    const chases = chaseList(trips, supplierMap, ctx.now);
    const outstanding = summary.expected + summary.invoiced;

    if (chases.length === 0) {
      const msg =
        outstanding > 0
          ? `No commission is overdue. ${money(outstanding)} is still expected or invoiced.`
          : "No commission outstanding — everything owed has been received.";
      return listResult([], msg);
    }

    const rows: ResultRow[] = chases.slice(0, 30).map((c) => {
      const meta = tripMeta.get(c.tripId);
      const who = meta?.household_id ? nameById.get(meta.household_id) : null;
      return {
        id: c.tripId,
        href: meta?.household_id ? `/customers/${meta.household_id}` : "/commission",
        title: c.supplierName,
        subtitle: [`${money(c.amount)} · ${c.daysOverdue}d overdue`, meta?.destination, who].filter(Boolean).join(" · "),
        badges: ["Overdue"],
        meta: { amount: c.amount, daysOverdue: c.daysOverdue },
      };
    });

    const signals: Signal[] = [
      {
        kind: "commission_overdue",
        detail: `${money(summary.overdue)} overdue across ${chases.length} booking${chases.length === 1 ? "" : "s"}; ${money(outstanding)} outstanding in total`,
        severity: "warning",
        rowIds: chases.slice(0, 10).map((c) => c.tripId),
      },
    ];

    const summaryLine = `${money(summary.overdue)} of commission is overdue to chase across ${chases.length} booking${chases.length === 1 ? "" : "s"}.`;
    return listResult(rows, summaryLine, signals, true);
  },
};
