/**
 * Customer detail view — composes the full page from the v4 mockup.
 *
 * Sections, in render order:
 *   1. Delta strip (Sarah pre-cached; generic for others)
 *   2. Header card (avatar, key meta)
 *   3. AI brief panel
 *   4. Three predictive cards
 *   5. Timeline
 *   6. Listening footer
 *   Right column: next steps, trips, household graph, preferences, compliance
 */

import Link from "next/link";
import {
  SparklesIcon,
  ClockIcon,
  PlaneIcon,
  PaperclipIcon,
} from "@/components/ui/icons";
import {
  STAGE_META,
  formatMoney,
  formatDate,
} from "@/lib/trips/presentation";
import { BriefActions } from "./brief-actions";
import { NextSteps } from "./next-steps";
import { PreferencesPanelEditable } from "./preferences-panel";
import { CustomFieldsPanel } from "./custom-fields-panel";
import { TravellersPanel, type TravellerRow } from "./travellers-panel";
import { LocationPanel } from "./location-panel";
import { HouseholdEditButton } from "./household-edit";
import { TimelineCompose } from "./timeline-compose";
import { AddTask } from "@/app/tasks/add-task";
import { ConsentPanel, type ConsentPanelContact } from "./consent-panel";
import type { ConsentChannel, ChannelState } from "@/lib/consent/state";
import type { MemoryFact, MemoryCategory } from "@/lib/memory/travel-memory";
import type { NextStep } from "@/lib/customer/next-steps";
import type { EngagementState } from "@/lib/email/engagement";
import type { FieldDef, CustomValues } from "@/lib/custom-fields/schema";
import {
  CASE_TYPE_LABELS,
  PRIORITY_META,
  CASE_STATUS_LABELS,
  isCaseOpen,
  type CaseType,
} from "@/lib/cases/priority";
import { clockState } from "@/lib/enquiries/clock";
import { formatAddress } from "@/lib/address/postcode";
import type {
  Household,
  Contact,
  Trip,
  Interaction,
  CaseRow,
} from "@/lib/supabase/types";

type Preference = {
  id: string;
  household_id: string;
  category: string;
  value: string;
};

type Props = {
  household: Household;
  contacts: Contact[];
  trips: Trip[];
  interactions: Interaction[];
  /** What happened after each email we sent, keyed by its timeline entry. */
  engagement?: Record<string, EngagementState>;
  /** The agency's own fields, and this customer's answers. */
  customFields?: FieldDef[];
  customValues?: CustomValues;
  preferences: Preference[];
  predictionCards?: PredictionCard[];
  nextSteps: NextStep[];
  latestInboundId: string | null;
  consentContacts: ConsentPanelContact[];
  consentState: Record<string, Partial<Record<ConsentChannel, ChannelState>>>;
  consentLedgerMissing: boolean;
  memoryFacts: MemoryFact[];
  /** Service cases for this household, most urgent first. */
  cases?: CaseRow[];
  casesMissing?: boolean;
};

// Sarah Thompson's UUID changes per seed; we identify the exemplar by name
const isExemplar = (h: Household) => h.display_name === "Sarah & James Thompson";

// ─── Avatar helpers (same as customers list) ───────────────────────────
const avatarColors = [
  "#FF8E8E", "#FFB57E", "#FFD96B", "#A8D86F",
  "#6BD4C5", "#6BB3D4", "#9D8FE0", "#D87EAA",
];
function avatarColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return avatarColors[Math.abs(h) % avatarColors.length];
}
function initials(name: string): string {
  const parts = name.replace(/\(.*?\)/g, "").trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const second = parts.find((p, i) => i > 0 && /^[A-Z]/.test(p))?.[0] ?? parts[1]?.[0] ?? "";
  return (first + second).toUpperCase().slice(0, 2);
}
function relativeDate(iso: string): string {
  const then = new Date(iso);
  const diffMs = then.getTime() - Date.now();
  const diffHours = Math.round(diffMs / 3600000);
  const diffDays = Math.round(diffMs / 86400000);
  if (Math.abs(diffHours) < 1) return "just now";
  if (Math.abs(diffHours) < 24) {
    return diffHours < 0 ? `${-diffHours}h ago` : `in ${diffHours}h`;
  }
  if (Math.abs(diffDays) < 30) {
    return diffDays < 0 ? `${-diffDays}d ago` : `in ${diffDays}d`;
  }
  return then.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

// ─── Stage colours ─────────────────────────────────────────────────────
// Colours + labels come from the shared STAGE_META so the pill here and the
// Trips Kanban can never drift apart. This wrapper just renders them as JSX.
function stagePill(stage: string) {
  const s = STAGE_META[stage as keyof typeof STAGE_META] ?? STAGE_META.enquiry;
  return (
    <span
      style={{
        background: s.bg,
        color: s.fg,
        fontSize: 10.5,
        padding: "2px 8px",
        borderRadius: 4,
        fontWeight: 600,
        letterSpacing: "0.02em",
      }}
    >
      {s.label}
    </span>
  );
}

// ─── Country flag emojis (small subset, fallback to plane) ─────────────
const flags: Record<string, string> = {
  GR: "🇬🇷", IT: "🇮🇹", ES: "🇪🇸", PT: "🇵🇹", FR: "🇫🇷", GB: "🇬🇧",
  US: "🇺🇸", CA: "🇨🇦", MX: "🇲🇽", JP: "🇯🇵", VN: "🇻🇳", ID: "🇮🇩",
  MV: "🇲🇻", AE: "🇦🇪", TR: "🇹🇷", HR: "🇭🇷", IS: "🇮🇸", NO: "🇳🇴",
  AT: "🇦🇹", CY: "🇨🇾", JE: "🇯🇪", FO: "🇫🇴", MA: "🇲🇦", NG: "🇳🇬",
  GH: "🇬🇭", JO: "🇯🇴", AR: "🇦🇷", AQ: "🇦🇶", EC: "🇪🇨", CR: "🇨🇷",
  MU: "🇲🇺", CV: "🇨🇻",
};

export function CustomerDetailView({
  household,
  contacts,
  trips,
  interactions,
  engagement,
  customFields,
  customValues,
  preferences,
  predictionCards,
  nextSteps,
  latestInboundId,
  consentContacts,
  consentState,
  consentLedgerMissing,
  memoryFacts,
  cases,
  casesMissing,
}: Props) {
  const exemplar = isExemplar(household);
  const lead = contacts.find((c) => c.role === "lead") ?? contacts[0];
  const partners = contacts.filter((c) => c.role === "partner");
  const children = contacts.filter((c) => c.role === "child");
  const dependants = contacts.filter((c) => c.role === "dependant");

  const activeTrip = trips.find((t) => t.stage === "travelling");
  const upcomingTrips = trips.filter(
    (t) => t.stage === "pre_departure" || t.stage === "booked"
  );
  const pastTrips = trips.filter((t) => t.stage === "returned");

  return (
    <div
      style={{
        padding: 28,
        maxWidth: 1400,
        margin: "0 auto",
        width: "100%",
      }}
    >
      {/* ─── Delta strip ─────────────────────────────────────── */}
      <DeltaStrip exemplar={exemplar} />

      {/* ─── Two-column layout ───────────────────────────────── */}
      <div className="rgrid rgrid-detail" style={{ gap: 20, alignItems: "start" }}>
        {/* ─── Main column ───────────────────────────────────── */}
        <div>
          <HeaderCard household={household} contacts={contacts} lead={lead} />
          <AIBrief household={household} exemplar={exemplar} latestInboundId={latestInboundId} />
          <PredictionsRow exemplar={exemplar} cards={predictionCards} />
          <TravelMemoryPanel facts={memoryFacts} />
          <Timeline interactions={interactions} engagement={engagement} householdId={household.id} />
          <ListeningFooter exemplar={exemplar} />
        </div>

        {/* ─── Right column ──────────────────────────────────── */}
        <div>
          <NextSteps householdId={household.id} steps={nextSteps} />
          {household.notes && <HeadsUpPanel notes={household.notes} />}
          <TripsPanel
            activeTrip={activeTrip}
            upcomingTrips={upcomingTrips}
            pastTrips={pastTrips}
          />
          <ServiceCasesPanel cases={cases ?? []} />

          {household.postcode && (
            <LocationPanel postcode={household.postcode} address={formatAddress(household)} />
          )}

          {(lead || partners.length || children.length || dependants.length) ? (
            <HouseholdGraph
              lead={lead}
              partners={partners}
              children={children}
              dependants={dependants}
            />
          ) : null}
          <TravellersPanel
            householdId={household.id}
            initial={contacts as unknown as TravellerRow[]}
            tripPending={Boolean(activeTrip) || upcomingTrips.length > 0}
          />
          <CustomFieldsPanel
            householdId={household.id}
            fields={customFields ?? []}
            initial={customValues ?? {}}
          />
          <PreferencesPanelEditable
            householdId={household.id}
            initial={preferences.map((p) => ({
              id: p.id,
              category: p.category,
              value: p.value,
            }))}
          />
          <ConsentPanel
            contacts={consentContacts}
            state={consentState}
            ledgerMissing={consentLedgerMissing}
          />
          <CompliancePanel
            household={household}
            contacts={contacts}
            trips={trips}
          />
        </div>
      </div>
    </div>
  );
}

// ─── Delta strip ────────────────────────────────────────────────────────
function DeltaStrip({ exemplar }: { exemplar: boolean }) {
  return (
    <div
      style={{
        background:
          "linear-gradient(135deg, rgba(0, 180, 216, 0.06) 0%, rgba(72, 202, 228, 0.02) 100%)",
        border: "1px solid rgba(0, 180, 216, 0.2)",
        borderRadius: 12,
        padding: "12px 16px",
        marginBottom: 16,
        display: "flex",
        alignItems: "center",
        gap: 14,
      }}
    >
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: 9,
          background: "rgba(0, 180, 216, 0.12)",
          color: "var(--tg-accent-dark)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <SparklesIcon width={14} height={14} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 10.5,
            fontWeight: 600,
            color: "var(--tg-accent-dark)",
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            marginBottom: 2,
          }}
        >
          {exemplar ? "3 new things since you last looked" : "What's changed"}
        </div>
        <div style={{ fontSize: 13, color: "var(--text)", lineHeight: 1.5 }}>
          {exemplar ? (
            <>
              Sarah <strong>emailed twice</strong> (transfer worry, restaurant
              change), <strong>opened the Maldives quote on her phone at
              11:14 PM Tuesday</strong>, and the resort confirmed the
              anniversary surprise (Ithaa Undersea, night 3, paid).
            </>
          ) : (
            <>
              Activity since your last visit will appear here — emails,
              chat messages, quote views, supplier confirmations.
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Header card ────────────────────────────────────────────────────────
function HeaderCard({
  household,
  contacts,
  lead,
}: {
  household: Household;
  contacts: Contact[];
  lead?: Contact;
}) {
  const meta = [
    { label: "Type", value: `${household.household_type ?? "—"} · ${contacts.length} ${contacts.length === 1 ? "person" : "people"}` },
    { label: "Customer since", value: formatDate(household.customer_since) },
    { label: "Lifetime value", value: formatMoney(household.lifetime_value) },
    { label: "Trips booked", value: String(household.trips_count) },
  ];

  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        padding: 18,
        marginBottom: 16,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 14 }}>
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: 12,
            background: avatarColor(household.display_name),
            color: "white",
            fontWeight: 600,
            fontSize: 16,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          {initials(household.display_name)}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 18,
              fontWeight: 700,
              color: "var(--text)",
              letterSpacing: "-0.01em",
            }}
          >
            {household.display_name}
          </div>
          <div
            style={{
              fontSize: 12.5,
              color: "var(--text-muted)",
              marginTop: 2,
            }}
          >
            {[lead?.email, lead?.phone].filter(Boolean).join(" · ")}
          </div>
          {formatAddress(household) && (
            <div style={{ fontSize: 12, color: "var(--text-subtle)", marginTop: 2 }}>
              {formatAddress(household)}
            </div>
          )}
        </div>
        {(household.tags ?? []).length > 0 && (
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {household.tags.slice(0, 2).map((tag) => (
              <span
                key={tag}
                style={{
                  fontSize: 10.5,
                  padding: "3px 8px",
                  borderRadius: 5,
                  background:
                    tag === "VIP"
                      ? "rgba(239, 68, 68, 0.08)"
                      : "rgba(0, 180, 216, 0.08)",
                  color:
                    tag === "VIP" ? "var(--error)" : "var(--tg-accent-dark)",
                  border: `1px solid ${tag === "VIP" ? "rgba(239, 68, 68, 0.2)" : "rgba(0, 180, 216, 0.2)"}`,
                  fontWeight: 600,
                }}
              >
                {tag}
              </span>
            ))}
          </div>
        )}
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
          <AddTask defaultCustomerId={household.id} />
          <HouseholdEditButton
            householdId={household.id}
            displayName={household.display_name}
            householdType={household.household_type}
            addressLine1={household.address_line1}
            addressLine2={household.address_line2}
            city={household.city}
            county={household.county}
            postcode={household.postcode}
          />
        </div>
      </div>

      <div
        className="rgrid rgrid-4"
        style={{ gap: 12, paddingTop: 14, borderTop: "1px solid var(--border)" }}
      >
        {meta.map((m) => (
          <div key={m.label}>
            <div
              style={{
                fontSize: 10.5,
                fontWeight: 600,
                color: "var(--text-subtle)",
                letterSpacing: "0.05em",
                textTransform: "uppercase",
                marginBottom: 3,
              }}
            >
              {m.label}
            </div>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--text)" }}>
              {m.value}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── AI Brief ───────────────────────────────────────────────────────────
function AIBrief({
  household,
  exemplar,
  latestInboundId,
}: {
  household: Household;
  exemplar: boolean;
  latestInboundId: string | null;
}) {
  const briefText = household.ai_brief
    || (exemplar
      ? "Brief generation pending."
      : `${household.display_name} · ${household.household_type} · customer since ${formatDate(household.customer_since)}. Lifetime value ${formatMoney(household.lifetime_value)}. No Luna brief yet — use "Refresh brief" below to generate one from this customer's history.`);

  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        padding: 18,
        marginBottom: 16,
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 12,
        }}
      >
        <div
          style={{
            width: 24,
            height: 24,
            borderRadius: 6,
            background:
              "linear-gradient(135deg, var(--tg-primary) 0%, var(--tg-accent) 100%)",
            color: "white",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <SparklesIcon width={12} height={12} />
        </div>
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: "var(--text)",
            letterSpacing: "0.04em",
            textTransform: "uppercase",
          }}
        >
          Luna · Customer 360
        </div>
        {household.ai_brief_at && (
          <div
            style={{
              marginLeft: "auto",
              fontSize: 10.5,
              color: "var(--text-subtle)",
              fontFamily: '"JetBrains Mono", monospace',
            }}
          >
            Generated {relativeDate(household.ai_brief_at)}
          </div>
        )}
      </div>
      <div
        style={{
          fontSize: 14,
          lineHeight: 1.65,
          color: "var(--text)",
        }}
      >
        {briefText}
      </div>

      <BriefActions householdId={household.id} latestInboundId={latestInboundId} />
    </div>
  );
}

// ─── Predictions ────────────────────────────────────────────────────────
type PredictionCard = {
  tag: string;
  confidence: string;
  fill: number;
  title: string;
  reason: string;
  variant: "opportunity" | "match" | "risk";
};

function PredictionsRow({
  exemplar,
  cards: realCards,
}: {
  exemplar: boolean;
  cards?: PredictionCard[];
}) {
  // Real computed cards take precedence. Fall back to the exemplar demo (Sarah)
  // or the empty-state placeholders when no scores have been computed yet.
  const cards: PredictionCard[] =
    realCards ??
    (exemplar
      ? [
          {
            tag: "Opportunity",
            confidence: "78%",
            fill: 78,
            title: "Likely to book Q4 2026",
            reason: "Pattern: every Oct/Nov for half-term. Two anchor signals.",
            variant: "opportunity" as const,
          },
          {
            tag: "Trip match",
            confidence: "82%",
            fill: 82,
            title: "Amalfi Coast, strong fit",
            reason:
              "Boutique hotels, water access, food-led. The Patels loved it last year.",
            variant: "match" as const,
          },
          {
            tag: "Risk",
            confidence: "Low",
            fill: 18,
            title: "Passports OK through 2029",
            reason: "All four valid · 6+ months on every planned trip date.",
            variant: "risk" as const,
          },
        ]
      : [
          {
            tag: "Opportunity",
            confidence: "—",
            fill: 0,
            title: "Likely next booking",
            reason: "Insufficient history to predict yet, needs 3+ bookings.",
            variant: "opportunity" as const,
          },
          {
            tag: "Trip match",
            confidence: "—",
            fill: 0,
            title: "Awaiting preference signals",
            reason: "Build preferences over time to surface ideas here.",
            variant: "match" as const,
          },
          {
            tag: "Risk",
            confidence: "Low",
            fill: 18,
            title: "No flags",
            reason: "Passport, supplier history and compliance all clear.",
            variant: "risk" as const,
          },
        ]);

  return (
    <div className="rgrid rgrid-3" style={{ gap: 10, marginBottom: 16 }}>
      {cards.map((c) => {
        const tagColor =
          c.variant === "opportunity"
            ? "var(--success)"
            : c.variant === "match"
            ? "var(--tg-accent-dark)"
            : "var(--warning)";
        const fillBg =
          c.variant === "opportunity"
            ? "var(--success)"
            : c.variant === "match"
            ? "var(--tg-accent)"
            : "var(--warning)";
        return (
          <div
            key={c.tag}
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 10,
              padding: "12px 14px",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 8,
              }}
            >
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  color: tagColor,
                }}
              >
                {c.tag}
              </span>
              <span
                style={{
                  marginLeft: "auto",
                  fontFamily: '"JetBrains Mono", monospace',
                  fontSize: 11,
                  fontWeight: 600,
                  color: "var(--text)",
                }}
              >
                {c.confidence}
              </span>
            </div>
            <div
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: "var(--text)",
                marginBottom: 4,
                lineHeight: 1.3,
              }}
            >
              {c.title}
            </div>
            <div
              style={{
                fontSize: 11.5,
                color: "var(--text-muted)",
                lineHeight: 1.45,
              }}
            >
              {c.reason}
            </div>
            <div
              style={{
                height: 3,
                background: "var(--bg-subtle)",
                borderRadius: 2,
                marginTop: 8,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: "100%",
                  borderRadius: 2,
                  background: fillBg,
                  width: `${c.fill}%`,
                  transformOrigin: "left",
                  animation: "scaleFromLeft 0.9s cubic-bezier(0.34, 1.56, 0.64, 1) 0.15s backwards",
                }}
              />
            </div>
          </div>
        );
      })}

      <style>{`
        @keyframes scaleFromLeft {
          from { transform: scaleX(0); }
          to { transform: scaleX(1); }
        }
      `}</style>
    </div>
  );
}

// ─── Timeline ───────────────────────────────────────────────────────────
function Timeline({
  interactions,
  engagement,
  householdId,
}: {
  interactions: Interaction[];
  engagement?: Record<string, EngagementState>;
  householdId: string;
}) {
  // Internal audit entries (kind: 'system') record things like brief
  // regeneration for our own diagnostics. They must never appear in the
  // customer-facing activity feed, both because the detail (model names etc.)
  // is internal, and because the brand the client sees is always "Luna".
  const visible = interactions.filter((ix) => ix.kind !== "system");

  if (visible.length === 0) {
    return (
      <Panel title="Timeline">
        <TimelineCompose householdId={householdId} />
        <div
          style={{
            padding: "30px 16px",
            textAlign: "center",
            color: "var(--text-subtle)",
            fontSize: 13,
          }}
        >
          No activity recorded yet.
        </div>
      </Panel>
    );
  }

  return (
    <Panel title="Timeline">
      <TimelineCompose householdId={householdId} />
      <div style={{ padding: 16 }}>
        {visible.map((ix) => {
          // What became of this email after it left. Honest by construction:
          // an open is labelled a hint, a click is labelled evidence, and a
          // reply outranks both (lib/email/engagement.ts).
          const eng = engagement?.[ix.id];
          // What went with the message. Part of the record: "I sent you the
          // itinerary" is only checkable if the timeline says which file.
          const files = Array.isArray(ix.metadata?.attachments)
            ? (ix.metadata!.attachments as { filename?: string }[])
                .map((f) => f.filename)
                .filter((n): n is string => Boolean(n))
            : [];
          const engColour: Record<string, string> = {
            acted: "var(--success)",
            weak: "var(--text-muted)",
            delivered: "var(--text-subtle)",
            quiet: "var(--text-subtle)",
            failed: "var(--danger)",
          };
          const occurred = new Date(ix.occurred_at);
          const dateLabel = occurred.toLocaleDateString("en-GB", {
            day: "numeric",
            month: "short",
          });
          const timeLabel = occurred.toLocaleTimeString("en-GB", {
            hour: "2-digit",
            minute: "2-digit",
          });

          const kindLabel: Record<string, string> = {
            email_in: "Email received",
            email_out: "Email sent",
            chat: "Live chat",
            enquiry: "Web enquiry",
            call: "Call",
            note: "Note",
            system: "System",
          };

          const kindColor: Record<string, string> = {
            email_in: "var(--info)",
            email_out: "var(--info)",
            chat: "var(--tg-accent-dark)",
            enquiry: "var(--warning)",
            call: "var(--success)",
            note: "var(--text-muted)",
            system: "var(--text-subtle)",
          };

          return (
            <div
              key={ix.id}
              style={{
                display: "grid",
                gridTemplateColumns: "70px 1fr",
                gap: 14,
                paddingBottom: 14,
                marginBottom: 14,
                borderBottom: "1px solid var(--border)",
              }}
            >
              <div
                style={{
                  fontSize: 11.5,
                  color: "var(--text-subtle)",
                  fontFamily: '"JetBrains Mono", monospace',
                }}
              >
                {dateLabel}
                <br />
                <span style={{ fontSize: 10.5 }}>{timeLabel}</span>
              </div>
              <div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    marginBottom: 4,
                  }}
                >
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 600,
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      color: kindColor[ix.kind] ?? "var(--text-muted)",
                    }}
                  >
                    {kindLabel[ix.kind] ?? ix.kind}
                  </span>
                  {ix.subject && (
                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: "var(--text)",
                      }}
                    >
                      {ix.subject}
                    </span>
                  )}
                </div>
                {ix.body_summary || ix.body ? (
                  <div
                    style={{
                      fontSize: 12.5,
                      color: "var(--text-muted)",
                      lineHeight: 1.5,
                    }}
                  >
                    {ix.body_summary
                      ?? (ix.body && ix.body.length > 200
                        ? ix.body.slice(0, 200) + "…"
                        : ix.body)}
                  </div>
                ) : null}
                {files.length > 0 && (
                  <div
                    style={{
                      marginTop: 6,
                      fontSize: 11,
                      color: "var(--text-muted)",
                      display: "flex",
                      alignItems: "center",
                      gap: 5,
                      flexWrap: "wrap",
                    }}
                  >
                    <PaperclipIcon width={11} height={11} />
                    {files.join(", ")}
                  </div>
                )}
                {eng && (
                  <div style={{ marginTop: 6, fontSize: 11, lineHeight: 1.5 }}>
                    <span
                      style={{
                        fontWeight: 700,
                        color: engColour[eng.strength] ?? "var(--text-muted)",
                      }}
                    >
                      {eng.label}
                    </span>
                    <span style={{ color: "var(--text-subtle)" }}> — {eng.detail}</span>
                  </div>
                )}
                {ix.ai_priority && (
                  <div
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 5,
                      marginTop: 6,
                      fontSize: 11,
                      color: "var(--tg-accent-dark)",
                      fontStyle: "italic",
                    }}
                  >
                    <SparklesIcon width={11} height={11} />
                    {ix.ai_reason ?? `Triaged: ${ix.ai_priority}`}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

// ─── Listening footer ───────────────────────────────────────────────────
function ListeningFooter({ exemplar }: { exemplar: boolean }) {
  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 10,
        padding: "11px 14px",
        marginTop: 16,
        display: "flex",
        alignItems: "center",
        gap: 12,
        fontSize: 12,
        color: "var(--text-muted)",
        lineHeight: 1.5,
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: "var(--tg-accent)",
          boxShadow: "0 0 8px var(--tg-accent)",
          animation: "pulse 2.5s ease-in-out infinite",
          flexShrink: 0,
        }}
      />
      <span>
        <strong style={{ color: "var(--text)", fontWeight: 500 }}>
          Luna's been listening.
        </strong>{" "}
        {exemplar
          ? "Re-checked passport validity this morning, flagged the Olympic Holidays history, noted Crete weather is fine, prepared the brief above."
          : "Background checks running — passport validity, supplier history, GDPR consent, compliance status."}
      </span>
    </div>
  );
}

// ─── Right column: Heads-up ─────────────────────────────────────────────
// The household's standing note (e.g. "bad transfer in Crete 2024"). The inbox
// mini-card already surfaces this; it matters even more here, where the agent
// is actually working the record.
function HeadsUpPanel({ notes }: { notes: string }) {
  return (
    <div
      style={{
        background: "rgba(245, 158, 11, 0.05)",
        border: "1px solid rgba(245, 158, 11, 0.15)",
        borderRadius: 12,
        padding: 14,
        marginBottom: 16,
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontWeight: 600,
          color: "var(--warning)",
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          marginBottom: 6,
        }}
      >
        Heads-up
      </div>
      <div style={{ fontSize: 12.5, color: "var(--text)", lineHeight: 1.5 }}>{notes}</div>
    </div>
  );
}

// ─── Right column: Trips ────────────────────────────────────────────────
function TripsPanel({
  activeTrip,
  upcomingTrips,
  pastTrips,
}: {
  activeTrip?: Trip;
  upcomingTrips: Trip[];
  pastTrips: Trip[];
}) {
  return (
    <Panel title="Trips" noPadding>
      <div style={{ padding: 14 }}>
        {activeTrip && <TripCard trip={activeTrip} variant="active" />}
        {upcomingTrips.map((t) => (
          <TripCard key={t.id} trip={t} variant="upcoming" />
        ))}
        {pastTrips.slice(0, 2).map((t) => (
          <TripCard key={t.id} trip={t} variant="past" />
        ))}
      </div>
    </Panel>
  );
}

// ─── Service cases ──────────────────────────────────────────────────────
// What's gone wrong for this customer, and whether it's been put right. The
// same P1–P4 badges and SLA clock as the /service queue, so a case reads the
// same wherever it's seen. Open cases lead; resolved ones fall to the bottom
// and are shown settled. Nothing to show → the panel doesn't appear.
function ServiceCasesPanel({ cases }: { cases: CaseRow[] }) {
  if (cases.length === 0) return null;

  const open = cases.filter((c) => isCaseOpen(c.status));
  const settled = cases.filter((c) => !isCaseOpen(c.status));
  const ordered = [...open, ...settled];

  return (
    <Panel
      title="Service cases"
      extra={
        open.length > 0 ? (
          <Link href="/service" style={{ color: "var(--tg-accent-dark)", textDecoration: "none" }}>
            {open.length} open →
          </Link>
        ) : (
          "All resolved"
        )
      }
      noPadding
    >
      <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
        {ordered.map((c) => (
          <CaseCard key={c.id} c={c} />
        ))}
      </div>
    </Panel>
  );
}

function CaseCard({ c }: { c: CaseRow }) {
  const badge = PRIORITY_META[c.priority];
  const settled = !isCaseOpen(c.status);
  // Only the live cases run a clock; a resolved case just says so.
  const clock = settled
    ? null
    : clockState({ receivedAt: c.opened_at, dueAt: c.sla_due_at, respondedAt: null });
  const clockColor =
    clock?.state === "overdue"
      ? "var(--error)"
      : clock?.state === "warning"
        ? "var(--warning)"
        : "var(--text-muted)";

  return (
    <div
      style={{
        background: "var(--bg-subtle)",
        border: "1px solid var(--border)",
        borderRadius: 10,
        padding: "10px 12px",
        opacity: settled ? 0.72 : 1,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
        <span
          style={{
            fontSize: 10.5,
            fontWeight: 700,
            padding: "2px 7px",
            borderRadius: 999,
            background: badge.bg,
            color: badge.fg,
            whiteSpace: "nowrap",
          }}
        >
          {badge.label}
        </span>
        <span style={{ fontSize: 11.5, color: "var(--text-muted)" }}>
          {CASE_TYPE_LABELS[c.case_type as CaseType] ?? c.case_type}
        </span>
        <span style={{ marginLeft: "auto", fontSize: 11, fontWeight: 600, color: settled ? "var(--success)" : "var(--text-subtle)" }}>
          {CASE_STATUS_LABELS[c.status]}
        </span>
      </div>
      <div style={{ fontSize: 13, color: "var(--text)", lineHeight: 1.35 }}>{c.subject}</div>
      <div style={{ marginTop: 4, fontSize: 11, color: settled ? "var(--text-subtle)" : clockColor }}>
        {settled
          ? `Resolved ${c.resolved_at ? formatDate(c.resolved_at) : ""}`.trim()
          : clock?.label
            ? `SLA ${clock.label}`
            : `Opened ${formatDate(c.opened_at)}`}
      </div>
    </div>
  );
}

function TripCard({
  trip,
  variant,
}: {
  trip: Trip;
  variant: "active" | "upcoming" | "past";
}) {
  const flag =
    flags[trip.destination_country ?? ""] ?? "✈️";
  const isActive = variant === "active";

  return (
    <div
      style={{
        background: "var(--bg-subtle)",
        border: "1px solid var(--border)",
        borderRadius: 10,
        padding: 12,
        marginBottom: 10,
        opacity: variant === "past" ? 0.7 : 1,
      }}
    >
      {isActive && (
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            background: "rgba(16, 185, 129, 0.1)",
            color: "var(--success)",
            fontSize: 10.5,
            fontWeight: 600,
            padding: "2px 7px",
            borderRadius: 999,
            marginBottom: 8,
          }}
        >
          <span
            style={{
              width: 5,
              height: 5,
              borderRadius: "50%",
              background: "var(--success)",
              animation: "pulse 2s ease-in-out infinite",
            }}
          />
          Travelling now
        </div>
      )}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 10,
          marginBottom: 8,
        }}
      >
        <div style={{ fontSize: 22, lineHeight: 1, flexShrink: 0 }}>{flag}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: "var(--text)",
              marginBottom: 1,
            }}
          >
            {trip.destination ?? "—"}
          </div>
          <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>
            {trip.depart_date && trip.return_date
              ? `${formatDate(trip.depart_date)} — ${formatDate(trip.return_date)}`
              : "Dates TBC"}
            {trip.occasion ? ` · ${trip.occasion}` : ""}
          </div>
        </div>
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 12,
          color: "var(--text-muted)",
        }}
      >
        {stagePill(trip.stage)}
        <span style={{ opacity: 0.5 }}>·</span>
        <span style={{ fontWeight: 600, color: "var(--text)" }}>
          {formatMoney(trip.total_value)}
        </span>
        {trip.reference && (
          <>
            <span style={{ opacity: 0.5 }}>·</span>
            <span
              style={{
                fontFamily: '"JetBrains Mono", monospace',
                fontSize: 10.5,
              }}
            >
              {trip.reference}
            </span>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Right column: Household graph ──────────────────────────────────────
function HouseholdGraph({
  lead,
  partners,
  children,
  dependants,
}: {
  lead?: Contact;
  partners: Contact[];
  children: Contact[];
  dependants: Contact[];
}) {
  const totalPeople =
    (lead ? 1 : 0) + partners.length + children.length + dependants.length;
  const topRow = [lead, ...partners].filter(Boolean) as Contact[];
  const bottomRow = [...children, ...dependants];

  return (
    <Panel title="Household">
      <div
        style={{
          padding: "14px 14px 16px",
        }}
      >
        <div
          style={{
            background: "var(--bg-subtle)",
            borderRadius: 10,
            padding: "14px 12px",
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: "var(--text-subtle)",
              letterSpacing: "0.05em",
              textTransform: "uppercase",
              marginBottom: 10,
            }}
          >
            {totalPeople} {totalPeople === 1 ? "person" : "people"}
          </div>
          {topRow.length > 0 && <PersonRow contacts={topRow} role="top" />}
          {bottomRow.length > 0 && <PersonRow contacts={bottomRow} role="bottom" />}
        </div>
      </div>
    </Panel>
  );
}

function PersonRow({
  contacts,
  role,
}: {
  contacts: Contact[];
  role: "top" | "bottom";
}) {
  return (
    <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
      {contacts.map((c) => {
        const fullName = `${c.first_name} ${c.last_name ?? ""}`.trim();
        const isLead = c.role === "lead";
        const roleLabel =
          c.role === "lead"
            ? `Lead${c.date_of_birth ? ` · ${age(c.date_of_birth)}` : ""}`
            : c.role === "partner"
            ? `Partner${c.date_of_birth ? ` · ${age(c.date_of_birth)}` : ""}`
            : c.role === "child"
            ? `${c.date_of_birth ? age(c.date_of_birth) : "Child"}${c.dietary ? ` · ${c.dietary}` : ""}`
            : c.role === "dependant"
            ? `${c.date_of_birth ? age(c.date_of_birth) : "Dependant"}`
            : c.role;

        return (
          <div
            key={c.id}
            style={{
              background: "var(--surface)",
              border: `1px solid ${isLead ? "rgba(0, 180, 216, 0.4)" : "var(--border)"}`,
              borderRadius: 8,
              padding: "6px 10px 6px 6px",
              display: "flex",
              alignItems: "center",
              gap: 7,
              flex: 1,
              minWidth: 110,
            }}
          >
            <div
              style={{
                width: 24,
                height: 24,
                borderRadius: 6,
                background: avatarColor(fullName),
                color: "white",
                fontWeight: 600,
                fontSize: 10,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              {initials(fullName)}
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: "var(--text)",
                  lineHeight: 1.2,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {c.first_name}
              </div>
              <div
                style={{
                  fontSize: 10.5,
                  color: "var(--text-subtle)",
                  marginTop: 1,
                }}
              >
                {roleLabel}
              </div>
            </div>
            {c.flags?.includes("allergy") && (
              <span style={{ color: "var(--warning)", fontSize: 11 }}>⚠</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function age(dob: string): number {
  const birth = new Date(dob);
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
  return age;
}

// The live Preferences panel is PreferencesPanelEditable (./preferences-panel);
// an earlier read-only PreferencesPanel with a decorative "Edit →" that led
// nowhere used to live here and has been removed. prefRowStyle stays — the
// Compliance panel below uses it.
function prefRowStyle(): React.CSSProperties {
  return {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "6px 0",
    gap: 12,
    borderBottom: "1px solid var(--border)",
  };
}

// ─── Right column: Compliance ───────────────────────────────────────────
// Whole months between two dates, floored — the way a border officer counts.
function monthsUntil(fromIso: string, expiryIso: string): number {
  const from = new Date(`${fromIso.slice(0, 10)}T00:00:00Z`);
  const to = new Date(`${expiryIso.slice(0, 10)}T00:00:00Z`);
  let m = (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + (to.getUTCMonth() - from.getUTCMonth());
  if (to.getUTCDate() < from.getUTCDate()) m -= 1;
  return m;
}

function CompliancePanel({
  contacts,
  trips,
}: {
  household: Household;
  contacts: Contact[];
  trips: Trip[];
}) {
  const gdprActive = contacts.some((c) => c.gdpr_consent);

  // Measure passports against the trip they are actually taking. The six-month
  // margin is what most destinations ask for, counted from the return date —
  // NOT "expires after today", which passes a passport that will be refused at
  // check-in. With no upcoming trip we fall back to six months from today,
  // which is a conservative floor and never claims safe when it isn't.
  const soonest = trips
    .filter((t) => ["booked", "pre_departure", "travelling"].includes(t.stage))
    .filter((t) => t.depart_date)
    .sort((a, b) => (a.depart_date! < b.depart_date! ? -1 : 1))[0];
  const reference = soonest?.return_date ?? soonest?.depart_date ?? new Date().toISOString();

  const withExpiry = contacts.filter((c) => c.passport_expiry);
  const missing = contacts.length - withExpiry.length;
  const tight = withExpiry.filter((c) => monthsUntil(reference, c.passport_expiry!) < 6).length;

  const passportState: "ok" | "warn" | "none" =
    contacts.length === 0 || missing === contacts.length ? "none" : tight > 0 || missing > 0 ? "warn" : "ok";

  const passportLabel =
    contacts.length === 0
      ? "No travellers on file"
      : missing === contacts.length
        ? "None on file"
        : tight > 0
          ? `${tight} too close to expiry${missing > 0 ? `, ${missing} not on file` : ""}`
          : missing > 0
            ? `${withExpiry.length} on file, ${missing} not`
            : `All ${contacts.length} on file, good margin`;

  return (
    <Panel title="Compliance">
      <div style={{ padding: "14px 16px" }}>
        <div style={prefRowStyle()}>
          <span style={{ fontSize: 11, color: "var(--text-subtle)", fontWeight: 500 }}>
            GDPR consent
          </span>
          <span style={{ fontSize: 12, color: gdprActive ? "var(--success)" : "var(--text-subtle)" }}>
            {gdprActive ? "Active" : "Not on file"}
          </span>
        </div>
        {/* Marketing opt-in moved to the per-channel Consent panel above. */}
        <div style={prefRowStyle()}>
          <span style={{ fontSize: 11, color: "var(--text-subtle)", fontWeight: 500 }}>
            Passports
          </span>
          <span
            style={{
              fontSize: 12,
              color:
                passportState === "ok"
                  ? "var(--success)"
                  : passportState === "warn"
                    ? "var(--warning)"
                    : "var(--text-subtle)",
            }}
          >
            {passportLabel}
          </span>
        </div>
        {(tight > 0 || missing > 0) && contacts.length > 0 && (
          <div style={{ fontSize: 10.5, color: "var(--text-subtle)", marginTop: 4, lineHeight: 1.5 }}>
            Measured against {soonest ? "the upcoming trip's return date" : "today"}, six months being the margin most destinations ask for. Fix it in Travellers &amp; passports above.
          </div>
        )}
      </div>
    </Panel>
  );
}

// ─── Travel memory — the signature feature ──────────────────────────────
// A readable account of how this customer travels, assembled from real rows,
// every line citing its source (lib/memory/travel-memory.ts). Hidden when
// there is nothing honest to say yet.

const MEMORY_GROUPS: { key: MemoryCategory; label: string }[] = [
  { key: "places", label: "Where they go" },
  { key: "rhythm", label: "How they book" },
  { key: "money", label: "What they spend" },
  { key: "party", label: "Who travels" },
  { key: "tastes", label: "What they like" },
  { key: "watchouts", label: "Worth knowing" },
];

function TravelMemoryPanel({ facts }: { facts: MemoryFact[] }) {
  if (facts.length === 0) return null;

  return (
    <section
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 14,
        marginTop: 16,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "12px 18px",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span style={{ fontSize: 13.5, fontWeight: 700, color: "var(--text)" }}>
          Travel memory
        </span>
        <span style={{ fontSize: 10.5, color: "var(--text-subtle)" }}>
          every line cites its source
        </span>
      </div>
      <div
        className="rgrid rgrid-2"
        style={{
          padding: "14px 18px",
          gap: "4px 24px",
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
        }}
      >
        {MEMORY_GROUPS.map(({ key, label }) => {
          const group = facts.filter((f) => f.category === key);
          if (group.length === 0) return null;
          return (
            <div key={key} style={{ marginBottom: 10, breakInside: "avoid" }}>
              <div
                style={{
                  fontSize: 10.5,
                  fontWeight: 700,
                  color: "var(--text-subtle)",
                  letterSpacing: "0.05em",
                  textTransform: "uppercase",
                  marginBottom: 4,
                }}
              >
                {label}
              </div>
              {group.map((f, i) => (
                <div key={`${key}-${i}`} style={{ marginBottom: 6 }}>
                  <div style={{ fontSize: 12.5, color: "var(--text)", lineHeight: 1.45 }}>
                    {f.text}
                  </div>
                  <div style={{ fontSize: 10.5, color: "var(--text-subtle)", fontStyle: "italic" }}>
                    {f.source}
                  </div>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ─── Generic panel ──────────────────────────────────────────────────────
function Panel({
  title,
  extra,
  noPadding = false,
  children,
}: {
  title: string;
  extra?: React.ReactNode;
  noPadding?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        marginBottom: 16,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 16px",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div
          style={{
            fontSize: 12.5,
            fontWeight: 600,
            color: "var(--text)",
            letterSpacing: "-0.005em",
          }}
        >
          {title}
        </div>
        {extra && (
          <div
            style={{
              fontSize: 12,
              color: "var(--tg-accent-dark)",
              fontWeight: 500,
            }}
          >
            {extra}
          </div>
        )}
      </div>
      <div style={noPadding ? {} : { padding: 0 }}>{children}</div>
    </div>
  );
}
