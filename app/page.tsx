/**
 * Dashboard — the home surface. /
 *
 * Server Component (mirrors /trips and /reports):
 *   - One parallel fetch of households, trips and inbound interactions for the
 *     agency, then everything is computed in memory and server-rendered. No
 *     client interactivity here, so the page stays fast and the bundle small.
 *   - Reuses the shared trip helpers (STAGE_META, formatMoney, flagFor,
 *     daysUntil) so a trip looks identical here, on the board and on the
 *     customer page.
 *
 * If the database is empty it points at the same seed flow the Customers and
 * Trips pages use, so a fresh deploy tells you what to do rather than showing
 * a wall of zeros.
 */

import Link from "next/link";
import { Topbar } from "@/components/layout/topbar";
import { createClient, AGENCY_ID } from "@/lib/supabase/server";
import {
  PlusIcon,
  SparklesIcon,
  UsersIcon,
  PlaneIcon,
  ClockIcon,
  InboxIcon,
} from "@/components/ui/icons";
import {
  STAGE_META,
  BOARD_STAGES,
  formatMoney,
  formatMoneyFull,
  flagFor,
  daysUntil,
} from "@/lib/trips/presentation";
import type {
  Household,
  Trip,
  Interaction,
  TripStage,
} from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

// Stages whose total_value counts as live, un-won pipeline (an open opportunity).
const OPEN_STAGES: TripStage[] = ["enquiry", "quoted"];
// Stages whose value is forward-committed revenue (won, not yet returned).
const FORWARD_STAGES: TripStage[] = ["booked", "pre_departure", "travelling"];

export default async function DashboardPage() {
  const supabase = createClient();

  const [
    { data: households },
    { data: trips },
    { data: interactions },
    { data: journeyRuns },
  ] = await Promise.all([
    supabase
      .from("households")
      .select("id, display_name, household_type, city, lifetime_value, tags")
      .eq("agency_id", AGENCY_ID),
    supabase
      .from("trips")
      .select(
        "id, household_id, stage, destination, destination_country, depart_date, return_date, total_value, occasion, reference"
      )
      .eq("agency_id", AGENCY_ID),
    supabase
      .from("interactions")
      .select("*")
      .eq("agency_id", AGENCY_ID)
      .eq("direction", "inbound")
      .order("occurred_at", { ascending: false })
      .limit(60),
    supabase
      .from("journey_runs")
      .select("id, status, result, fired_at")
      .order("fired_at", { ascending: false })
      .limit(4),
  ]);

  const hh = (households ?? []) as Pick<
    Household,
    "id" | "display_name" | "household_type" | "city" | "lifetime_value" | "tags"
  >[];
  const tr = (trips ?? []) as Trip[];
  const ix = (interactions ?? []) as Interaction[];
  const runs = (journeyRuns ?? []) as {
    id: string;
    status: string;
    result: { summary?: string; action?: string } | null;
    fired_at: string;
  }[];

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

  // ─── Inbox ────────────────────────────────────────────────────────────
  const needsToday = ix.filter((i) => i.ai_priority === "today");
  const recent = ix.slice(0, 6);

  // ─── Pipeline by stage ────────────────────────────────────────────────
  const stageRows = BOARD_STAGES.map((stage) => {
    const rows = tr.filter((t) => t.stage === stage);
    const value = rows.reduce((s, t) => s + (t.total_value ?? 0), 0);
    return { stage, count: rows.length, value };
  });
  const maxStageValue = Math.max(1, ...stageRows.map((r) => r.value));

  // ─── Morning-briefing sentence ────────────────────────────────────────
  const brief = buildBriefSentence({
    needsToday: needsToday.length,
    departing7,
    openPipeline,
    travellingNow: travellingNow.length,
  });

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
        <Greeting />
        <BriefingBanner brief={brief} />

        {/* KPI row */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 14,
            marginTop: 18,
          }}
        >
          <Kpi
            icon={<UsersIcon width={15} height={15} />}
            label="Customers"
            value={String(totalCustomers)}
            sub={`${formatMoneyFull(totalLtv)} lifetime value`}
            href="/customers"
          />
          <Kpi
            icon={<SparklesIcon width={15} height={15} />}
            label="Live pipeline"
            value={formatMoney(openPipeline)}
            sub={`${formatMoney(forwardBooked)} booked ahead`}
            href="/trips"
            accent
          />
          <Kpi
            icon={<PlaneIcon width={15} height={15} />}
            label="Departing (7 days)"
            value={String(departing7)}
            sub={`${travellingNow.length} travelling now`}
            href="/trips"
          />
          <Kpi
            icon={<InboxIcon width={15} height={15} />}
            label="Needs you today"
            value={String(needsToday.length)}
            sub={`${ix.length} in the inbox`}
            href="/inbox?lane=today"
          />
        </div>

        {/* Two-column body */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1.35fr 1fr",
            gap: 18,
            marginTop: 18,
            alignItems: "start",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <PipelinePanel rows={stageRows} max={maxStageValue} />
            <DeparturesPanel
              travelling={travellingNow}
              upcoming={upcoming}
              nameById={nameById}
            />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <NeedsAttentionPanel items={needsToday} nameById={nameById} />
            <RecentActivityPanel items={recent} nameById={nameById} />
          </div>
        </div>

        <AutoPilotStrip runs={runs} />
      </Shell>
    </>
  );
}

// ─── Auto-pilot strip (what Luna did in the background) ────────────────────

function AutoPilotStrip({
  runs,
}: {
  runs: { id: string; status: string; result: { summary?: string } | null; fired_at: string }[];
}) {
  if (runs.length === 0) return null;
  return (
    <section
      style={{
        marginTop: 18,
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 14,
        padding: 18,
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 12,
        }}
      >
        <h2
          style={{
            fontSize: 13,
            fontWeight: 600,
            margin: 0,
            display: "inline-flex",
            alignItems: "center",
            gap: 7,
          }}
        >
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: "var(--tg-accent)",
              animation: "pulse 2s ease-in-out infinite",
            }}
          />
          Luna on auto-pilot
        </h2>
        <PanelLink href="/journeys">Manage journeys →</PanelLink>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${Math.min(runs.length, 4)}, 1fr)`,
          gap: 12,
        }}
      >
        {runs.map((r) => (
          <div
            key={r.id}
            style={{
              background: "var(--bg-subtle)",
              border: "1px solid var(--border)",
              borderRadius: 10,
              padding: "11px 13px",
            }}
          >
            <div style={{ fontSize: 12.5, color: "var(--text)", lineHeight: 1.4 }}>
              {r.result?.summary ?? "Action taken"}
            </div>
            <div style={{ fontSize: 11, color: "var(--text-subtle)", marginTop: 4 }}>
              {relativeTime(r.fired_at)}
              {r.status === "queued" ? (
                <span style={{ color: "var(--warning)" }}> · awaiting review</span>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </section>
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

// ─── Briefing banner (navy with teal glow — same family as Next Steps) ─────

function BriefingBanner({ brief }: { brief: string }) {
  return (
    <div
      style={{
        background:
          "linear-gradient(135deg, var(--tg-primary) 0%, var(--tg-primary-dark) 100%)",
        borderRadius: 14,
        padding: "22px 24px",
        color: "white",
        position: "relative",
        overflow: "hidden",
        boxShadow: "0 20px 40px -22px rgba(27, 43, 91, 0.45)",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: "-60%",
          right: "-8%",
          width: 360,
          height: 360,
          background:
            "radial-gradient(circle, var(--tg-accent) 0%, transparent 70%)",
          opacity: 0.22,
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 7,
          fontSize: 11,
          fontWeight: 600,
          color: "var(--tg-accent-light)",
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          marginBottom: 10,
          position: "relative",
        }}
      >
        <SparklesIcon width={13} height={13} />
        Luna · Your morning briefing
      </div>
      <p
        style={{
          fontSize: 16,
          lineHeight: 1.6,
          margin: 0,
          maxWidth: 760,
          position: "relative",
          fontWeight: 450,
        }}
      >
        {brief}
      </p>
    </div>
  );
}

function buildBriefSentence(args: {
  needsToday: number;
  departing7: number;
  openPipeline: number;
  travellingNow: number;
}): string {
  const { needsToday, departing7, openPipeline, travellingNow } = args;
  const parts: string[] = [];

  if (needsToday > 0) {
    parts.push(
      `${needsToday} message${needsToday === 1 ? "" : "s"} need${
        needsToday === 1 ? "s" : ""
      } you today`
    );
  }
  if (departing7 > 0) {
    parts.push(
      `${departing7} departure${departing7 === 1 ? "" : "s"} in the next 7 days`
    );
  }
  if (travellingNow > 0) {
    parts.push(
      `${travellingNow} household${
        travellingNow === 1 ? " is" : "s are"
      } travelling right now`
    );
  }
  if (openPipeline > 0) {
    parts.push(`${formatMoney(openPipeline)} of live enquiries in the pipeline`);
  }

  if (parts.length === 0) {
    return "Nothing urgent on the board this morning. The inbox is clear and no departures are imminent, so it is a good window to chase quotes or reach out to past travellers.";
  }

  // Join naturally: "A, B and C."
  const last = parts.pop()!;
  const sentence = parts.length ? `${parts.join(", ")} and ${last}` : last;
  return `You have ${sentence}.`;
}

// ─── KPI card ──────────────────────────────────────────────────────────────

function Kpi({
  icon,
  label,
  value,
  sub,
  href,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  href: string;
  accent?: boolean;
}) {
  return (
    <Link
      href={href}
      style={{
        display: "block",
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        padding: 16,
        textDecoration: "none",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 7,
          color: accent ? "var(--tg-accent-dark)" : "var(--text-subtle)",
          marginBottom: 10,
        }}
      >
        {icon}
        <span
          style={{
            fontSize: 11.5,
            fontWeight: 600,
            letterSpacing: "0.02em",
            textTransform: "uppercase",
            color: "var(--text-muted)",
          }}
        >
          {label}
        </span>
      </div>
      <div
        style={{
          fontSize: 26,
          fontWeight: 700,
          letterSpacing: "-0.02em",
          color: "var(--text)",
          lineHeight: 1.1,
        }}
      >
        {value}
      </div>
      <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
        {sub}
      </div>
    </Link>
  );
}

// ─── Panels ────────────────────────────────────────────────────────────────

function Panel({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 14,
        padding: 18,
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 14,
        }}
      >
        <h2
          style={{
            fontSize: 13,
            fontWeight: 600,
            letterSpacing: "0.01em",
            margin: 0,
            color: "var(--text)",
          }}
        >
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function PanelLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      style={{
        fontSize: 12,
        fontWeight: 500,
        color: "var(--tg-accent-dark)",
        textDecoration: "none",
      }}
    >
      {children}
    </Link>
  );
}

function PipelinePanel({
  rows,
  max,
}: {
  rows: { stage: TripStage; count: number; value: number }[];
  max: number;
}) {
  return (
    <Panel title="Pipeline by stage" action={<PanelLink href="/trips">Open board →</PanelLink>}>
      <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
        {rows.map((r) => {
          const meta = STAGE_META[r.stage];
          const pct = Math.round((r.value / max) * 100);
          return (
            <div key={r.stage}>
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  justifyContent: "space-between",
                  marginBottom: 5,
                }}
              >
                <span
                  style={{
                    fontSize: 12.5,
                    fontWeight: 500,
                    color: "var(--text)",
                  }}
                >
                  {meta.label}
                  <span
                    style={{
                      color: "var(--text-subtle)",
                      fontWeight: 400,
                      marginLeft: 7,
                    }}
                  >
                    {r.count}
                  </span>
                </span>
                <span
                  className="mono"
                  style={{ fontSize: 12, color: "var(--text-muted)" }}
                >
                  {formatMoney(r.value)}
                </span>
              </div>
              <div
                style={{
                  height: 7,
                  borderRadius: 5,
                  background: "var(--bg-subtle)",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: `${pct}%`,
                    height: "100%",
                    borderRadius: 5,
                    background: meta.fg,
                    minWidth: r.value > 0 ? 4 : 0,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

function DeparturesPanel({
  travelling,
  upcoming,
  nameById,
}: {
  travelling: Trip[];
  upcoming: Trip[];
  nameById: Map<string, string>;
}) {
  const hasAny = travelling.length > 0 || upcoming.length > 0;
  return (
    <Panel
      title="Departures & travelling"
      action={<PanelLink href="/trips">All trips →</PanelLink>}
    >
      {!hasAny ? (
        <Empty text="No departures in the next two weeks." />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {travelling.map((t) => (
            <TripRow
              key={t.id}
              trip={t}
              name={nameById.get(t.household_id) ?? "Unknown household"}
              live
            />
          ))}
          {upcoming.slice(0, 6).map((t) => (
            <TripRow
              key={t.id}
              trip={t}
              name={nameById.get(t.household_id) ?? "Unknown household"}
            />
          ))}
        </div>
      )}
    </Panel>
  );
}

function TripRow({
  trip,
  name,
  live,
}: {
  trip: Trip;
  name: string;
  live?: boolean;
}) {
  const d = daysUntil(trip.depart_date);
  const when = live
    ? "Away now"
    : d === 0
      ? "Today"
      : d === 1
        ? "Tomorrow"
        : `${d} days`;
  return (
    <Link
      href={`/customers/${trip.household_id}`}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 11,
        padding: "9px 8px",
        borderRadius: 9,
        textDecoration: "none",
        color: "inherit",
      }}
    >
      <span style={{ fontSize: 18, lineHeight: 1 }}>
        {flagFor(trip.destination_country)}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 500,
            color: "var(--text)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {trip.destination ?? "Trip"}
          {trip.occasion ? (
            <span style={{ color: "var(--text-subtle)", fontWeight: 400 }}>
              {" · "}
              {trip.occasion}
            </span>
          ) : null}
        </div>
        <div
          style={{
            fontSize: 11.5,
            color: "var(--text-muted)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {name}
        </div>
      </div>
      {live ? (
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            fontSize: 11,
            fontWeight: 600,
            color: "var(--success)",
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: "var(--success)",
              animation: "pulse 2s ease-in-out infinite",
            }}
          />
          {when}
        </span>
      ) : (
        <span
          className="mono"
          style={{
            fontSize: 11.5,
            fontWeight: 500,
            color: d != null && d <= 2 ? "var(--warning)" : "var(--text-muted)",
            whiteSpace: "nowrap",
          }}
        >
          {when}
        </span>
      )}
    </Link>
  );
}

function NeedsAttentionPanel({
  items,
  nameById,
}: {
  items: Interaction[];
  nameById: Map<string, string>;
}) {
  return (
    <Panel
      title="Needs you today"
      action={<PanelLink href="/inbox?lane=today">Open inbox →</PanelLink>}
    >
      {items.length === 0 ? (
        <Empty text="Inbox is clear. Nothing flagged for today." />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {items.slice(0, 5).map((i) => (
            <Link
              key={i.id}
              href={`/inbox?id=${i.id}&lane=today`}
              style={{
                display: "flex",
                gap: 10,
                padding: "9px 8px",
                borderRadius: 9,
                textDecoration: "none",
                color: "inherit",
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: "var(--error)",
                  marginTop: 6,
                  flexShrink: 0,
                }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 500,
                    color: "var(--text)",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {i.subject ?? "(no subject)"}
                </div>
                <div
                  style={{
                    fontSize: 11.5,
                    color: "var(--text-muted)",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {i.household_id
                    ? nameById.get(i.household_id) ?? "Unknown"
                    : "Unknown"}
                  {i.ai_reason ? (
                    <span
                      style={{
                        color: "var(--tg-accent-dark)",
                        fontStyle: "italic",
                      }}
                    >
                      {" · "}
                      {i.ai_reason}
                    </span>
                  ) : null}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </Panel>
  );
}

function RecentActivityPanel({
  items,
  nameById,
}: {
  items: Interaction[];
  nameById: Map<string, string>;
}) {
  return (
    <Panel title="Recent activity">
      {items.length === 0 ? (
        <Empty text="No recent inbound activity." />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {items.map((i) => (
            <div
              key={i.id}
              style={{
                display: "flex",
                gap: 10,
                padding: "8px 8px",
                alignItems: "baseline",
              }}
            >
              <ClockIcon
                width={12}
                height={12}
                style={{ color: "var(--text-subtle)", flexShrink: 0, marginTop: 2 }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 12.5,
                    color: "var(--text)",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {i.subject ?? i.body_summary ?? "Activity"}
                </div>
                <div style={{ fontSize: 11, color: "var(--text-subtle)" }}>
                  {i.household_id ? nameById.get(i.household_id) ?? "" : ""}
                  {" · "}
                  {relativeTime(i.occurred_at)}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <p
      style={{
        fontSize: 12.5,
        color: "var(--text-subtle)",
        margin: "4px 2px",
      }}
    >
      {text}
    </p>
  );
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

// ─── Time helper ───────────────────────────────────────────────────────────

function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diff = Date.now() - then;
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}
