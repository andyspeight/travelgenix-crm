/**
 * Dashboard — the home surface. /
 *
 * ONE QUESTION: what needs you now?
 *
 * This used to be thirteen blocks — four KPI cards and seven panels — and
 * four of those panels were the same job. An enquiry on the clock, a quote
 * going cold, a message triaged as urgent and a thing Luna noticed are all
 * "here is something to do", and splitting them across four boxes left the
 * agent scanning four places and merging them in their head. That merge is
 * exactly the part software should be doing.
 *
 * So: a greeting, a sentence, one ranked list, one quiet line of numbers.
 * The ranking and the reasons come from lib/dashboard/today.ts, which is
 * pure and tested, so the order can be explained to an agent who disagrees
 * with it.
 *
 * Nothing was deleted, only moved to the screen that owns it: the pipeline
 * and departures live on /trips, the activity feed on /inbox, what the
 * overnight run did on /journeys. Each is one click away in the sidebar the
 * agent already uses.
 *
 * Server Component. One parallel fetch, everything computed in memory.
 */

import Link from "next/link";
import { Topbar } from "@/components/layout/topbar";
import { createClient } from "@/lib/supabase/server";
import { requireAgencyId } from "@/lib/auth/session";
import { PlusIcon, SparklesIcon } from "@/components/ui/icons";
import { clockState } from "@/lib/enquiries/clock";
import { chaseList, type CommissionSupplier } from "@/lib/commission/calc";
import {
  buildToday,
  summariseToday,
  type TodayItem,
} from "@/lib/dashboard/today";
import { rescueAlerts, type QuoteTripContext } from "@/lib/quotes/rescue";
import { computeSuggestions, type BouncedSend } from "@/lib/suggest/detectors";
import type { Contact, Enquiry, Quote } from "@/lib/supabase/types";
import { formatMoney, daysUntil } from "@/lib/trips/presentation";
import type {
  Household,
  Trip,
  Interaction,
  TripStage,
} from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

/** The commission columns this page selects alongside the trip. */
type CommissionColumns = {
  supplier_id: string | null;
  commission_rate: number | null;
  commission_amount: number | null;
  commission_status: "expected" | "invoiced" | "received" | "written_off" | null;
  commission_due_at: string | null;
  commission_received_at: string | null;
};

/**
 * How many rows before "N more". Eight is about where a list stops being
 * read and starts being scrolled past, and a dashboard that scrolls is the
 * problem this rewrite was fixing.
 */
const MAX_TODAY = 8;

// Stages whose total_value counts as live, un-won pipeline (an open opportunity).
const OPEN_STAGES: TripStage[] = ["enquiry", "quoted"];
// Stages whose value is forward-committed revenue (won, not yet returned).
const FORWARD_STAGES: TripStage[] = ["booked", "pre_departure", "travelling"];

export default async function DashboardPage() {
  const supabase = createClient();
  const agencyId = await requireAgencyId();

  const [
    { data: households },
    { data: supplierRows },
    { data: trips },
    { data: interactions },
    { count: openTasksCount },
    { data: overdueTaskRows },
    { data: enquiryRows },
    { data: quoteRows },
    { data: contactRows },
    { data: urgentCaseRows },
  ] = await Promise.all([
    supabase
      .from("households")
      .select("id, display_name, household_type, city, lifetime_value, tags, last_booking_at, trips_count")
      .eq("agency_id", agencyId),
    // Supplier terms, so late commission can be worked out and chased.
    supabase
      .from("suppliers")
      .select("id, name, default_commission_rate, payment_terms_days")
      .eq("agency_id", agencyId),
    supabase
      .from("trips")
      .select(
        "id, household_id, stage, destination, destination_country, depart_date, return_date, total_value, occasion, reference, supplier_id, commission_rate, commission_amount, commission_status, commission_due_at, commission_received_at"
      )
      .eq("agency_id", agencyId),
    supabase
      .from("interactions")
      .select("*")
      .eq("agency_id", agencyId)
      .eq("direction", "inbound")
      .order("occurred_at", { ascending: false })
      .limit(60),
    supabase
      .from("tasks")
      .select("*", { count: "exact", head: true })
      .eq("agency_id", agencyId)
      .in("status", ["open", "doing"]),
    // Tasks already past their due date belong on the list, not in a count.
    supabase
      .from("tasks")
      .select("id, title, household_id, due_at")
      .eq("agency_id", agencyId)
      .in("status", ["open", "doing"])
      .lt("due_at", new Date().toISOString())
      .order("due_at", { ascending: true })
      .limit(10),
    // Missing table (migration not run) just means an empty panel here.
    supabase
      .from("enquiries")
      .select(
        "id, contact_name, destination, budget, budget_basis, received_at, first_response_due_at, first_response_at, status, household_id"
      )
      .eq("agency_id", agencyId)
      .eq("status", "new")
      .order("received_at", { ascending: true })
      .limit(8),
    // Missing table (migration not run) just means no rescue panel.
    supabase
      .from("quotes")
      .select("*")
      .eq("agency_id", agencyId)
      .in("status", ["sent", "viewed"])
      .limit(100),
    // Contacts feed the Suggest detectors (passport risk, reachability).
    supabase
      .from("contacts")
      .select("id, household_id, role, first_name, last_name, email, phone, passport_expiry, gdpr_consent, flags")
      .eq("agency_id", agencyId),
    // Urgent open service cases (missing table just means none).
    supabase
      .from("cases")
      .select("id, household_id, subject, priority, priority_reason, sla_due_at")
      .eq("agency_id", agencyId)
      .in("status", ["open", "in_progress", "waiting"])
      .lte("priority", 2)
      .order("priority", { ascending: true })
      .limit(10),
  ]);

  const hh = (households ?? []) as Pick<
    Household,
    | "id"
    | "display_name"
    | "household_type"
    | "city"
    | "lifetime_value"
    | "tags"
    | "last_booking_at"
    | "trips_count"
  >[];
  // The select is a subset of Trip plus the commission columns, so it is cast
  // through unknown rather than pretending it is a whole row.
  const tr = (trips ?? []) as unknown as (Trip & CommissionColumns)[];
  const ix = (interactions ?? []) as Interaction[];

  // ─── Empty state ──────────────────────────────────────────────────────
  if (hh.length === 0 && tr.length === 0) {
    return (
      <>
        <Topbar title="Dashboard" />
        <Shell>
          <Greeting subtitle="Your workspace is ready. Add demo data to bring it to life." />
          <EmptyState />
        </Shell>
      </>
    );
  }

  const nameById = new Map(hh.map((h) => [h.id, h.display_name]));

  // ─── KPIs ─────────────────────────────────────────────────────────────
  const totalCustomers = hh.length;
  const totalLtv = hh.reduce((s, h) => s + (h.lifetime_value ?? 0), 0);

  const openPipeline = tr
    .filter((t) => OPEN_STAGES.includes(t.stage))
    .reduce((s, t) => s + (t.total_value ?? 0), 0);

  const forwardBooked = tr
    .filter((t) => FORWARD_STAGES.includes(t.stage))
    .reduce((s, t) => s + (t.total_value ?? 0), 0);

  // ─── Departures ───────────────────────────────────────────────────────
  // Live trips with a departure date in the next fortnight, soonest first.
  const upcoming = tr
    .filter((t) => {
      if (t.stage === "cancelled" || t.stage === "returned") return false;
      const d = daysUntil(t.depart_date);
      return d != null && d >= 0 && d <= 14;
    })
    .sort((a, b) => (daysUntil(a.depart_date) ?? 0) - (daysUntil(b.depart_date) ?? 0));

  const travellingNow = tr.filter((t) => t.stage === "travelling");
  const departing7 = upcoming.filter((t) => (daysUntil(t.depart_date) ?? 99) <= 7).length;

  // ─── Inbox + tasks ────────────────────────────────────────────────────
  const needsToday = ix.filter((i) => i.ai_priority === "today");
  const openTasks = openTasksCount ?? 0;

  // ─── Enquiries on the clock ───────────────────────────────────────────
  const waitingEnquiries = (enquiryRows ?? []) as Pick<
    Enquiry,
    | "id"
    | "contact_name"
    | "destination"
    | "budget"
    | "budget_basis"
    | "received_at"
    | "first_response_due_at"
    | "first_response_at"
    | "status"
    | "household_id"
  >[];
  const nowIso = new Date().toISOString();
  const enquiryClocks = waitingEnquiries
    .map((e) => ({
      e,
      clock: clockState({
        receivedAt: e.received_at,
        dueAt: e.first_response_due_at,
        respondedAt: e.first_response_at,
        now: nowIso,
      }),
    }))
    .sort((a, b) => a.clock.remainingMs - b.clock.remainingMs);

  // ─── Quote rescue ─────────────────────────────────────────────────────
  const openQuotes = (quoteRows ?? []) as Quote[];
  const quoteTripCtx = new Map<string, QuoteTripContext>(
    tr.map((t) => [t.id, { depart_date: t.depart_date, destination: t.destination }])
  );
  const quoteAlerts = rescueAlerts(openQuotes, quoteTripCtx, nowIso);

  // ─── Luna Suggest ("I noticed…") ──────────────────────────────────────
  const allContacts = (contactRows ?? []) as Contact[];
  const contactsByHousehold = new Map<string, Contact[]>();
  for (const c of allContacts) {
    const arr = contactsByHousehold.get(c.household_id) ?? [];
    arr.push(c);
    contactsByHousehold.set(c.household_id, arr);
  }
  const tripsByHousehold = new Map<string, Trip[]>();
  for (const t of tr) {
    const arr = tripsByHousehold.get(t.household_id) ?? [];
    arr.push(t);
    tripsByHousehold.set(t.household_id, arr);
  }
  // Undelivered mail, newest first per household: the record says we replied,
  // the customer never got it. Missing table just means no such suggestions.
  const { data: bouncedRows } = await supabase
    .from("email_sends")
    .select("household_id, to_email, status, created_at")
    .eq("agency_id", agencyId)
    .in("status", ["bounced", "complained"])
    .order("created_at", { ascending: false })
    .limit(200);

  const bouncedByHousehold = new Map<string, BouncedSend>();
  for (const b of (bouncedRows ?? []) as (BouncedSend & { created_at: string })[]) {
    if (b.household_id && !bouncedByHousehold.has(b.household_id)) {
      bouncedByHousehold.set(b.household_id, b);
    }
  }

  const suggestions = computeSuggestions(
    hh as unknown as Household[],
    contactsByHousehold,
    tripsByHousehold,
    new Date(nowIso),
    bouncedByHousehold
  );

  // ─── The one list ─────────────────────────────────────────────────────
  // Four sources in, one ranked list out. The rule lives in the lib, tested,
  // so the order is a decision rather than an accident of layout.
  // Commission a supplier is late paying. Money, not admin — and the only
  // row on the list that is worth cash the moment it is actioned.
  const supplierMap = new Map<string, CommissionSupplier>(
    ((supplierRows ?? []) as {
      id: string;
      name: string;
      default_commission_rate: number | null;
      payment_terms_days: number | null;
    }[]).map((s) => [
      s.id,
      {
        id: s.id,
        name: s.name,
        defaultCommissionRate: s.default_commission_rate,
        paymentTermsDays: s.payment_terms_days,
      },
    ])
  );

  const commissionChases = chaseList(
    tr
      .filter((t) => t.stage !== "cancelled" && t.stage !== "enquiry" && t.stage !== "quoted")
      .map((row) => {
        return {
          id: row.id,
          totalValue: row.total_value,
          supplierId: row.supplier_id ?? null,
          commissionRate: row.commission_rate ?? null,
          commissionAmount: row.commission_amount ?? null,
          status: row.commission_status ?? "expected",
          dueAt: row.commission_due_at ?? null,
          receivedAt: row.commission_received_at ?? null,
          departDate: row.depart_date,
          returnDate: row.return_date,
        };
      }),
    supplierMap,
    new Date(nowIso)
  );

  const today = buildToday({
    now: new Date(nowIso),
    enquiries: enquiryClocks.map(({ e, clock }) => ({
      id: e.id,
      who: e.contact_name,
      destination: e.destination,
      receivedAt: e.received_at,
      state: clock.state,
      label: clock.label,
      remainingMs: clock.remainingMs,
    })),
    quotes: quoteAlerts.map((a) => ({
      quoteId: a.quoteId,
      householdId: a.householdId,
      severity: a.severity,
      title: a.title,
      reason: a.reason,
      actionLabel: a.actionLabel,
      // A date running out is a different kind of urgent from silence.
      deadline:
        a.signals.includes("expiring_soon") ||
        a.signals.includes("expired_unmarked") ||
        a.signals.includes("departure_approaching"),
    })),
    messages: needsToday.map((m) => ({
      id: m.id,
      householdId: m.household_id,
      subject: m.subject,
      occurredAt: m.occurred_at,
      reason: m.ai_reason,
    })),
    suggestions: suggestions.map((sg) => ({
      id: sg.id,
      householdId: sg.householdId,
      severity: sg.severity,
      title: sg.title,
      reason: sg.reason,
      href: sg.href,
      actionLabel: sg.actionLabel,
      // A passport that will not make it is a deadline; a quiet customer is not.
      deadline: sg.kind === "passport_risk",
    })),
    tasks: ((overdueTaskRows ?? []) as {
      id: string;
      title: string;
      household_id: string | null;
      due_at: string;
    }[]).map((t) => ({
      id: t.id,
      title: t.title,
      householdId: t.household_id,
      dueAt: t.due_at,
    })),
    cases: ((urgentCaseRows ?? []) as {
      id: string;
      household_id: string | null;
      subject: string;
      priority: number;
      priority_reason: string | null;
      sla_due_at: string | null;
    }[]).map((c) => ({
      id: c.id,
      householdId: c.household_id,
      subject: c.subject,
      priority: c.priority,
      reason: c.priority_reason,
      slaDueAt: c.sla_due_at,
    })),
    commission: commissionChases.map((c) => ({
      tripId: c.tripId,
      supplierName: c.supplierName,
      amount: c.amount,
      daysOverdue: c.daysOverdue,
      reason: c.reason,
    })),
    nameById,
  });

  // ─── The line under the greeting ──────────────────────────────────────
  // Deliberately NOT a summary of the list below it. The list says what needs
  // doing; this says what is true today and is not on it.
  const brief = greetingLine(travellingNow.length);

  return (
    <>
      <Topbar
        title="Dashboard"
        actions={
          <Link
            href="/customers"
            style={{
              background: "transparent",
              border: "1px solid var(--border)",
              borderRadius: 6,
              padding: "6px 10px",
              color: "var(--text-muted)",
              fontSize: 12.5,
              fontWeight: 500,
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              textDecoration: "none",
            }}
          >
            <PlusIcon width={14} height={14} />
            Quick add
          </Link>
        }
      />

      <Shell>
        <Greeting subtitle={brief} />
        <TodayList items={today} />
        <QuietNumbers
          customers={totalCustomers}
          pipeline={openPipeline}
          departing={departing7}
          openTasks={openTasks}
        />
      </Shell>
    </>
  );
}

// ─── The list ──────────────────────────────────────────────────────────────
// The whole dashboard, really. Rows, not cards: a card per item turns eight
// things to do into a wall, and the eye stops reading at about four.

function TodayList({ items }: { items: TodayItem[] }) {
  const shown = items.slice(0, MAX_TODAY);
  const more = items.length - shown.length;

  return (
    <div style={{ marginTop: 22 }}>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 10,
          marginBottom: 10,
        }}
      >
        <h2 style={{ margin: 0, fontSize: 13, fontWeight: 700, letterSpacing: "-0.01em" }}>
          Needs you today
        </h2>
        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{summariseToday(items)}</span>
      </div>

      {items.length === 0 ? (
        <div
          style={{
            border: "1px solid var(--border)",
            borderRadius: 10,
            background: "var(--surface)",
            padding: "28px 18px",
            textAlign: "center",
            fontSize: 13,
            color: "var(--text-muted)",
          }}
        >
          Nothing is waiting on you. Every enquiry has been answered and no quote is going cold.
        </div>
      ) : (
        <div
          style={{
            border: "1px solid var(--border)",
            borderRadius: 10,
            background: "var(--surface)",
            overflow: "hidden",
          }}
        >
          {shown.map((item, index) => (
            <TodayRow key={item.id} item={item} first={index === 0} />
          ))}
          {more > 0 && (
            // No link: the remaining items live on four different screens, and
            // a "more" that lands on the wrong one is worse than a sentence.
            <div
              style={{
                padding: "10px 16px",
                fontSize: 11.5,
                color: "var(--text-subtle)",
                borderTop: "1px solid var(--border)",
              }}
            >
              Showing the {MAX_TODAY} most pressing of {items.length}. Clear these and the rest
              move up.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TodayRow({ item, first }: { item: TodayItem; first: boolean }) {
  return (
    <Link
      href={item.href}
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 12,
        padding: "13px 16px",
        borderTop: first ? "none" : "1px solid var(--border)",
        textDecoration: "none",
        color: "inherit",
      }}
    >
      {/* One dot, one meaning: red = a promise already broken. */}
      <span
        aria-hidden
        style={{
          width: 7,
          height: 7,
          borderRadius: "50%",
          marginTop: 6,
          flexShrink: 0,
          background: item.breached ? "#dc2626" : "var(--tg-accent-dark)",
        }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>{item.who}</span>
          <span style={{ fontSize: 12.5, color: "var(--text-muted)" }}>{item.headline}</span>
        </div>
        <div style={{ fontSize: 12, color: "var(--text-subtle)", lineHeight: 1.5, marginTop: 2 }}>
          {item.reason}
        </div>
      </div>
      <span
        style={{
          fontSize: 11.5,
          fontWeight: 600,
          color: "var(--tg-accent-dark)",
          whiteSpace: "nowrap",
          marginTop: 2,
        }}
      >
        {item.action} →
      </span>
    </Link>
  );
}

// ─── The numbers, quietly ──────────────────────────────────────────────────
// One line, not four cards. These are worth glancing at and never worth
// acting on, and four cards said the opposite.

function QuietNumbers({
  customers,
  pipeline,
  departing,
  openTasks,
}: {
  customers: number;
  pipeline: number;
  departing: number;
  openTasks: number;
}) {
  const parts: { text: string; href: string }[] = [
    { text: `${customers} customer${customers === 1 ? "" : "s"}`, href: "/customers" },
    { text: `${formatMoney(pipeline)} live pipeline`, href: "/trips" },
    { text: `${departing} departing this week`, href: "/trips" },
  ];
  if (openTasks > 0) {
    parts.push({ text: `${openTasks} open task${openTasks === 1 ? "" : "s"}`, href: "/tasks" });
  }

  return (
    <div
      style={{
        marginTop: 18,
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: 6,
        fontSize: 12,
        color: "var(--text-muted)",
      }}
    >
      {parts.map((part, i) => (
        <span key={part.href + part.text} style={{ display: "inline-flex", gap: 6 }}>
          {i > 0 && <span style={{ color: "var(--text-subtle)" }}>·</span>}
          <Link href={part.href} style={{ color: "inherit", textDecoration: "none" }}>
            {part.text}
          </Link>
        </span>
      ))}
    </div>
  );
}

// ─── Layout primitives ────────────────────────────────────────────────────

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        padding: 28,
        maxWidth: 1400,
        margin: "0 auto",
        width: "100%",
      }}
    >
      {children}
    </div>
  );
}

function Greeting({ subtitle }: { subtitle?: string }) {
  const hour = new Date().getHours();
  const part =
    hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";
  return (
    <div style={{ marginBottom: 18 }}>
      <h1
        style={{
          fontSize: 24,
          fontWeight: 700,
          letterSpacing: "-0.02em",
          margin: "0 0 4px",
          color: "var(--text)",
        }}
      >
        Good {part}, Andy
      </h1>
      <p style={{ fontSize: 14, color: "var(--text-muted)", margin: 0 }}>
        {subtitle ??
          new Date().toLocaleDateString("en-GB", {
            weekday: "long",
            day: "numeric",
            month: "long",
          })}
      </p>
    </div>
  );
}

/**
 * The line under "Good morning".
 *
 * The old one listed everything: enquiries waiting, quotes at risk, messages,
 * tasks, departures, pipeline. It was accurate and nobody read it, because
 * every item in it appeared again as a panel two inches below.
 *
 * Now the list owns the work, so this owns the date, plus the one fact that
 * is genuinely context rather than a to-do: who is abroad right now. If
 * something goes wrong today, it will be one of them.
 */
function greetingLine(travellingNow: number): string {
  const date = new Date().toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  if (travellingNow === 0) return date;
  return `${date} · ${travellingNow} ${travellingNow === 1 ? "household is" : "households are"} travelling right now`;
}

// ─── Empty database state ──────────────────────────────────────────────────

function EmptyState() {
  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 14,
        padding: 32,
        textAlign: "center",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: 11,
          background: "var(--bg-subtle)",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--tg-accent-dark)",
          marginBottom: 14,
        }}
      >
        <SparklesIcon width={20} height={20} />
      </div>
      <h2 style={{ fontSize: 17, fontWeight: 600, margin: "0 0 6px" }}>
        No data yet
      </h2>
      <p
        style={{
          fontSize: 13.5,
          color: "var(--text-muted)",
          margin: "0 0 18px",
          maxWidth: 420,
          marginInline: "auto",
        }}
      >
        Seed the demo agency to populate households, trips and the inbox. The
        dashboard fills in the moment there is data to show.
      </p>
      <Link
        href="/customers"
        style={{
          display: "inline-block",
          background: "var(--tg-primary)",
          color: "white",
          fontSize: 13,
          fontWeight: 600,
          padding: "9px 16px",
          borderRadius: 8,
          textDecoration: "none",
        }}
      >
        Go to Customers to seed →
      </Link>
    </div>
  );
}
