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

import {
  SparklesIcon,
  PlusIcon,
  ClockIcon,
  PlaneIcon,
} from "@/components/ui/icons";
import {
  STAGE_META,
  formatMoney,
  formatDate,
} from "@/lib/trips/presentation";
import { BriefActions } from "./brief-actions";
import { PreferencesPanelEditable } from "./preferences-panel";
import type {
  Household,
  Contact,
  Trip,
  Interaction,
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
  preferences: Preference[];
  predictionCards?: PredictionCard[];
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
  preferences,
  predictionCards,
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
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 380px",
          gap: 20,
          alignItems: "start",
        }}
      >
        {/* ─── Main column ───────────────────────────────────── */}
        <div>
          <HeaderCard household={household} contacts={contacts} lead={lead} />
          <AIBrief household={household} exemplar={exemplar} />
          <PredictionsRow exemplar={exemplar} cards={predictionCards} />
          <Timeline interactions={interactions} />
          <ListeningFooter exemplar={exemplar} />
        </div>

        {/* ─── Right column ──────────────────────────────────── */}
        <div>
          <NextStepsPanel exemplar={exemplar} />
          <TripsPanel
            activeTrip={activeTrip}
            upcomingTrips={upcomingTrips}
            pastTrips={pastTrips}
          />
          {(lead || partners.length || children.length || dependants.length) ? (
            <HouseholdGraph
              lead={lead}
              partners={partners}
              children={children}
              dependants={dependants}
            />
          ) : null}
          <PreferencesPanelEditable
            householdId={household.id}
            initial={preferences.map((p) => ({
              id: p.id,
              category: p.category,
              value: p.value,
            }))}
          />
          <CompliancePanel
            household={household}
            contacts={contacts}
            exemplar={exemplar}
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
            {[lead?.email, lead?.phone, household.city]
              .filter(Boolean)
              .join(" · ")}
          </div>
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
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 12,
          paddingTop: 14,
          borderTop: "1px solid var(--border)",
        }}
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
}: {
  household: Household;
  exemplar: boolean;
}) {
  const briefText = household.ai_brief
    || (exemplar
      ? "Brief generation pending."
      : `${household.display_name} · ${household.household_type} · customer since ${formatDate(household.customer_since)}. Lifetime value ${formatMoney(household.lifetime_value)}. Brief generation in the demo focuses on Sarah Thompson — open her record (top of the customer list) to see the full Luna 360 in action.`);

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

      <BriefActions householdId={household.id} />
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
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        gap: 10,
        marginBottom: 16,
      }}
    >
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
function Timeline({ interactions }: { interactions: Interaction[] }) {
  // Internal audit entries (kind: 'system') record things like brief
  // regeneration for our own diagnostics. They must never appear in the
  // customer-facing activity feed, both because the detail (model names etc.)
  // is internal, and because the brand the client sees is always "Luna".
  const visible = interactions.filter((ix) => ix.kind !== "system");

  if (visible.length === 0) {
    return (
      <Panel title="Timeline">
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
    <Panel title="Timeline" extra="All activity →">
      <div style={{ padding: 16 }}>
        {visible.map((ix) => {
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

// ─── Right column: Next steps ───────────────────────────────────────────
function NextStepsPanel({ exemplar }: { exemplar: boolean }) {
  const steps = exemplar
    ? [
        {
          n: 1,
          text: "Reply to Sarah's email. Acknowledge Crete history, confirm InterMyt, share resort number.",
        },
        {
          n: 2,
          text: "Confirm Ithaa Undersea booking. Resort emailed; forward to her with personal note.",
        },
        {
          n: 3,
          text: "Pre-departure call tomorrow afternoon. Calendar slot held 14:00.",
        },
      ]
    : [
        { n: 1, text: "Open most recent message and respond if needed." },
        { n: 2, text: "Send a check-in note." },
        { n: 3, text: "Add a note to the customer record." },
      ];

  return (
    <div
      style={{
        background: "linear-gradient(135deg, var(--tg-primary-dark) 0%, #0E1837 100%)",
        borderRadius: 12,
        padding: 18,
        color: "white",
        marginBottom: 16,
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: "-30%",
          right: "-10%",
          width: 200,
          height: 200,
          background:
            "radial-gradient(circle, var(--tg-accent) 0%, transparent 70%)",
          opacity: 0.15,
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 12,
          position: "relative",
        }}
      >
        <SparklesIcon width={14} height={14} />
        <span
          style={{
            fontSize: 10.5,
            fontWeight: 600,
            color: "var(--tg-accent-light)",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          Luna · Next steps
        </span>
      </div>
      <ol
        style={{
          listStyle: "none",
          margin: 0,
          padding: 0,
          position: "relative",
        }}
      >
        {steps.map((s, i) => (
          <li
            key={s.n}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 10,
              padding: "9px 0",
              borderBottom:
                i < steps.length - 1
                  ? "1px solid rgba(255, 255, 255, 0.08)"
                  : "none",
              fontSize: 13,
              lineHeight: 1.45,
              color: "rgba(255, 255, 255, 0.9)",
            }}
          >
            <span
              style={{
                width: 22,
                height: 22,
                borderRadius: 6,
                background: "rgba(72, 202, 228, 0.15)",
                color: "var(--tg-accent-light)",
                fontSize: 11,
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                border: "1px solid rgba(72, 202, 228, 0.3)",
              }}
            >
              {s.n}
            </span>
            <span style={{ flex: 1 }}>{s.text}</span>
            <button
              style={{
                background: "rgba(255, 255, 255, 0.1)",
                border: "1px solid rgba(255, 255, 255, 0.15)",
                color: "white",
                borderRadius: 6,
                padding: "3px 9px",
                fontSize: 11,
                fontWeight: 500,
                cursor: "pointer",
                flexShrink: 0,
              }}
            >
              Do
            </button>
          </li>
        ))}
      </ol>
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
    <Panel title="Trips" extra={<PlusIcon width={14} height={14} />} noPadding>
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
    <Panel title="Household" extra="Edit →">
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

// ─── Right column: Preferences ──────────────────────────────────────────
function PreferencesPanel({ preferences }: { preferences: Preference[] }) {
  if (preferences.length === 0) {
    return (
      <Panel title="Preferences" extra="Edit →">
        <div
          style={{
            padding: "16px",
          }}
        >
          {[
            { label: "Style", placeholder: "Add when known" },
            { label: "Airline", placeholder: "Add when known" },
            { label: "Budget band", placeholder: "Add when known" },
          ].map((p) => (
            <div key={p.label} style={prefRowStyle()}>
              <span style={{ fontSize: 11, color: "var(--text-subtle)", fontWeight: 500 }}>
                {p.label}
              </span>
              <span style={{ fontSize: 12, color: "var(--text-subtle)" }}>
                {p.placeholder}
              </span>
            </div>
          ))}
        </div>
      </Panel>
    );
  }

  const labels: Record<string, string> = {
    style: "Style",
    airline: "Airline",
    seat: "Seat",
    room: "Room",
    dietary: "Dietary",
    budget: "Budget",
    avoid: "Avoid",
    other: "Other",
  };

  return (
    <Panel title="Preferences" extra="Edit →">
      <div style={{ padding: "14px 16px" }}>
        {preferences.map((p) => (
          <div key={p.id} style={prefRowStyle()}>
            <span style={{ fontSize: 11, color: "var(--text-subtle)", fontWeight: 500 }}>
              {labels[p.category] ?? p.category}
            </span>
            <span style={{ fontSize: 12, color: "var(--text)", textAlign: "right" }}>
              {p.value}
            </span>
          </div>
        ))}
      </div>
    </Panel>
  );
}

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
function CompliancePanel({
  household,
  contacts,
  exemplar,
}: {
  household: Household;
  contacts: Contact[];
  exemplar: boolean;
}) {
  const allValidPassports = contacts.every(
    (c) => c.passport_expiry && new Date(c.passport_expiry) > new Date()
  );
  const gdprActive = contacts.some((c) => c.gdpr_consent);
  const marketingOptIn = contacts.some((c) => c.marketing_opt_in);

  return (
    <Panel title="Compliance">
      <div style={{ padding: "14px 16px" }}>
        <div style={prefRowStyle()}>
          <span style={{ fontSize: 11, color: "var(--text-subtle)", fontWeight: 500 }}>
            ATOL number
          </span>
          <span style={{ fontSize: 12, color: "var(--text)" }}>11471</span>
        </div>
        <div style={prefRowStyle()}>
          <span style={{ fontSize: 11, color: "var(--text-subtle)", fontWeight: 500 }}>
            GDPR consent
          </span>
          <span
            style={{
              fontSize: 12,
              color: gdprActive ? "var(--success)" : "var(--text-subtle)",
            }}
          >
            {gdprActive ? "Active" : "Not on file"}
          </span>
        </div>
        <div style={prefRowStyle()}>
          <span style={{ fontSize: 11, color: "var(--text-subtle)", fontWeight: 500 }}>
            Marketing opt-in
          </span>
          <span
            style={{
              fontSize: 12,
              color: marketingOptIn ? "var(--success)" : "var(--text-subtle)",
            }}
          >
            {marketingOptIn ? "Yes" : "No"}
          </span>
        </div>
        <div style={prefRowStyle()}>
          <span style={{ fontSize: 11, color: "var(--text-subtle)", fontWeight: 500 }}>
            Passports verified
          </span>
          <span
            style={{
              fontSize: 12,
              color: allValidPassports ? "var(--success)" : "var(--warning)",
            }}
          >
            {exemplar
              ? "All 4 · valid through 2029"
              : allValidPassports
              ? `${contacts.length} on file`
              : "Some missing"}
          </span>
        </div>
      </div>
    </Panel>
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
