"use client";

import { useState, useMemo, useTransition, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  SparklesIcon,
  PlaneIcon,
  ClockIcon,
  SendIcon,
  NoteIcon,
} from "@/components/ui/icons";
import { EmailComposer } from "@/components/email/composer";
import type {
  Household,
  Contact,
  Interaction,
} from "@/lib/supabase/types";

type Lane = "today" | "week" | "later" | "all";

type Props = {
  interactions: Interaction[];
  households: Household[];
  contacts: Contact[];
  initialSelectedId: string | null;
  initialLane: Lane;
  /** True when the server has a configured email provider — sends are real. */
  emailLive: boolean;
};

// ─── Avatar helpers ─────────────────────────────────────────────────────
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
function formatMoney(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n >= 1000) return `£${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  return `£${n.toLocaleString("en-GB")}`;
}
function relativeTime(iso: string): string {
  const then = new Date(iso);
  const diff = Date.now() - then.getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return then.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

// ─── Channel icons ──────────────────────────────────────────────────────
function channelLabel(channel: string | null): string {
  if (channel === "email") return "Email";
  if (channel === "live_chat") return "Chat";
  if (channel === "whatsapp") return "WhatsApp";
  if (channel === "phone") return "Phone";
  if (channel === "web_form") return "Enquiry form";
  return "—";
}

// ─── Drafts dictionary ──────────────────────────────────────────────────
// Hand-crafted draft replies per interaction, keyed by subject. These are the
// instant default so the demo is predictable. "Regenerate" calls Luna live
// (POST /api/inbox/[id]/drafts) and replaces them with fresh, grounded drafts.
type DraftSet = {
  drafts: Array<{
    label: string;
    confidence: number;
    rationale: string;
    body: string;
  }>;
};

const DRAFT_LIBRARY: Record<string, DraftSet> = {
  "Quick question about transfers in Maldives": {
    drafts: [
      {
        label: "Reassuring · personal · references Crete",
        confidence: 92,
        rationale:
          "Acknowledges the 2024 Crete experience by name, confirms InterMyt is the supplier, gives the resort number for peace of mind. Matches Sarah's warm tone.",
        body: `Sarah, totally hear you — what happened in Crete two years ago shouldn't have happened. This time we're with InterMyt (the team at Vakkaru's preferred operator) and they monitor flight status directly with the airline. If your flight slips, the speedboat waits, full stop.

I've also pinged Vakkaru directly — they have the kids' names and a private water taxi on standby in the rare event you need one. You'll have the resort manager's mobile in your final docs (going across this afternoon).

Have a brilliant time. The Ithaa surprise is locked in for night three.

Andy`,
      },
      {
        label: "Brief · operational",
        confidence: 78,
        rationale:
          "Sticks to the facts — transfer supplier, monitoring, contingency. Useful if Sarah's looking for the answer rather than the warmth.",
        body: `Hi Sarah, the transfer is with InterMyt. They monitor flights and will wait if there's a delay. The resort also has a private water taxi on standby if needed.

You'll have the resort manager's mobile in your final docs. Andy`,
      },
      {
        label: "Warm · light · short",
        confidence: 71,
        rationale:
          "Two lines of reassurance, no operational detail. Risk: might feel dismissive given the past trauma reference.",
        body: `Sarah — relax, completely covered. InterMyt monitors your flight and waits. Resort knows you and will look after you.

Have the best time. Andy`,
      },
    ],
  },
  "Madeira final docs": {
    drafts: [
      {
        label: "Direct confirmation",
        confidence: 88,
        rationale:
          "Margaret's a long-term client who likes brief, factual answers. Confirms the booking and reassures her on what's already in place.",
        body: `Hi Margaret, yes the Funchal Hotel for the night before your flight back is confirmed — booking ref TG-2026-014b, breakfast included. I'll send your full document pack tomorrow morning.

Andy`,
      },
      {
        label: "Confirm + extras",
        confidence: 76,
        rationale:
          "Confirms the hotel and offers a small extra (a transfer note) — nice touch for a repeat customer.",
        body: `Hi Margaret, yes the Funchal hotel is confirmed for the night before. I'll also have a quick transfer briefing for you in the doc pack — easy walk to reception in the morning.

Travelling well? Andy`,
      },
    ],
  },
  "Re: Sardinia options for July": {
    drafts: [
      {
        label: "Engaged · solution-led",
        confidence: 85,
        rationale:
          "The Patels are warm — they've opened the quote four times. This response acknowledges option 2, says yes to the date tweak, and locks in the chef as a positive add-on.",
        body: `Rajesh — great choice on option 2. I've spoken to the villa, the dates can shift by a week without affecting the rate.

The private chef is a lovely add. I have a brilliant local — Sardinian, formally trained at the resort group, does an incredible seafood degustation. £350 for the evening including ingredients and wine pairing for six adults. Want me to pencil him in for a Friday?

I'll send updated docs across this afternoon.

Andy`,
      },
      {
        label: "Confirm + question",
        confidence: 79,
        rationale:
          "Confirms the date change is fine and asks one question to keep the conversation moving. Lower energy but reasonable.",
        body: `Rajesh, the date tweak is no problem. On the chef — what cuisine were you hoping for? I have two excellent options locally, both £300-400 for the evening. Andy`,
      },
    ],
  },
  "Tulum honeymoon — first enquiry": {
    drafts: [
      {
        label: "Honeymoon-aware · curates 2 properties",
        confidence: 89,
        rationale:
          "Olivia's first contact was via the website widget. She's named her budget and vibe. This response congratulates briefly, then drops two specific properties that fit (Casa Malca + Habitas Tulum). Includes a soft call to schedule a 15-min chat.",
        body: `Olivia, congratulations. Tulum's a gorgeous choice for 14 nights — beachfront, food, vibe, all of it.

Two properties to start: Casa Malca (the old Pablo Escobar mansion, eclectic, beachfront, serious food) and Habitas Tulum (more design-forward, jungle meets beach, brilliant in-room dining). Both fit the £3-4k for two with sensible flights from London.

I'll put together a proper itinerary, but a 15-minute call would help me get the brief exactly right — the difference between mid-range and quietly amazing usually comes down to two or three small choices. Got 15 minutes Thursday or Friday?

Andy`,
      },
      {
        label: "Standard intake",
        confidence: 72,
        rationale:
          "Asks for the date range, group size, and a couple of preference signals. Safe but doesn't move the conversation forward as fast.",
        body: `Hi Olivia, congratulations on the wedding! Tulum is wonderful. To put together the right options, can I confirm — are you looking at October specifically? Group size is just two of you? And any sense on whether you'd prefer a smaller boutique property or a larger resort with more activity? Andy`,
      },
    ],
  },
  "Re: Costa Rica itinerary version 3": {
    drafts: [
      {
        label: "Yes · with one note",
        confidence: 83,
        rationale:
          "Andrew's engaged buyer — three iterations, ready to close. Adding Monteverde is straightforward. Confirms the change and flags the small flight implication.",
        body: `Andrew, easy yes on Monteverde. I'll add a day there before Manuel Antonio — the cloud forest at dawn is genuinely otherworldly, you won't regret it.

One small heads-up — adding the day means we shift your internal flight by 24 hours, ~£80 change fee. Worth it.

I'll send v4 across by lunchtime.

Andy`,
      },
    ],
  },
  "Re: Faroe Islands packing list": {
    drafts: [
      {
        label: "Confirm · no fuss",
        confidence: 86,
        rationale:
          "Helen's organised and low-maintenance. Quick yes on the car, light reminder on one thing she might have missed.",
        body: `Helen, yes the car hire is sorted — Hertz at Vágar Airport, picked up on landing. You're all set.

One thing — the boots: aim for ankle-grip rather than knee-high, you'll do more hiking than wading. Have a brilliant time.

Andy`,
      },
    ],
  },
  "Long time no speak — thinking about somewhere new": {
    drafts: [
      {
        label: "Warm · suggests three directions",
        confidence: 81,
        rationale:
          "Margaret hasn't booked since 2024 Sicily. Re-engagement matters. This response is warm, doesn't oversell, and floats three concrete directions to test their appetite.",
        body: `Margaret, lovely to hear from you both. Brian still threatening to retire properly?

Three directions you could go this autumn — Croatia (still warm, more rugged than Sicily, brilliant food, well within your wheelhouse), Slovenia + Trieste (proper off-the-beaten-track, Lake Bled is genuinely magical, great prices), or going further — South Africa wine country, Cape Town and the Garden Route.

Want to come in for a coffee one morning next week? I'll have a couple of options ready.

Andy`,
      },
    ],
  },
  "Italian lakes for late September": {
    drafts: [
      {
        label: "Warm + helpful framing",
        confidence: 80,
        rationale:
          "Penelope's a new lead, solo. Acknowledge solo travel, recommend Lake Garda over Como (better for solo, more intimate), and flag that late September is prime time.",
        body: `Hi Penelope, thank you for getting in touch. The lakes in late September are gorgeous — warm enough for the boats and walks, cool enough for the wine.

For solo travel I'd nudge you towards Lake Garda over Como — Sirmione and Salò are smaller, walkable, and have a strong solo-traveller scene without being touristy. Como gets very couples-heavy in the shoulder season.

I have a couple of beautiful boutique hotels in mind. Shall I pull together a starter proposal? Five minutes by phone first would help.

Andy`,
      },
    ],
  },
};

// Generic fallback drafts when no library entry exists
const GENERIC_DRAFTS: DraftSet = {
  drafts: [
    {
      label: "Acknowledge + ask",
      confidence: 70,
      rationale:
        "Standard touch — confirms receipt and asks one question to move forward.",
      body: `Thanks for the message — let me look into this and come back to you with options.

Andy`,
    },
  ],
};

function getDrafts(ix: Interaction): DraftSet {
  if (ix.subject && DRAFT_LIBRARY[ix.subject]) return DRAFT_LIBRARY[ix.subject];
  return GENERIC_DRAFTS;
}

// ─── Main view ──────────────────────────────────────────────────────────
export function InboxView({
  interactions,
  households,
  contacts,
  initialSelectedId,
  initialLane,
  emailLive,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const [activeDraftIdx, setActiveDraftIdx] = useState(0);
  // True while the open reply composer holds unsent work. Switching message or
  // lane unmounts it, so we ask before throwing a half-written reply away.
  const [composerDirty, setComposerDirty] = useState(false);

  // Lookup tables
  const householdMap = useMemo(() => {
    const m = new Map<string, Household>();
    households.forEach((h) => m.set(h.id, h));
    return m;
  }, [households]);

  const leadsByHousehold = useMemo(() => {
    const m = new Map<string, Contact>();
    contacts.forEach((c) => {
      if (c.role === "lead") m.set(c.household_id, c);
    });
    return m;
  }, [contacts]);

  // Bucket interactions by lane
  const buckets = useMemo(() => {
    const today: Interaction[] = [];
    const week: Interaction[] = [];
    const later: Interaction[] = [];
    const untriaged: Interaction[] = [];
    for (const ix of interactions) {
      if (ix.ai_priority === "today") today.push(ix);
      else if (ix.ai_priority === "week") week.push(ix);
      else if (ix.ai_priority === "later") later.push(ix);
      else untriaged.push(ix);
    }
    return { today, week, later, untriaged };
  }, [interactions]);

  // Derive the current lane and the visible list
  const lane = initialLane;
  const visible: Interaction[] = useMemo(() => {
    if (lane === "today") return buckets.today;
    if (lane === "week") return buckets.week;
    if (lane === "later") return buckets.later;
    return interactions;
  }, [lane, buckets, interactions]);

  // Resolve the selected interaction
  const selectedIx = useMemo(() => {
    if (initialSelectedId) {
      return interactions.find((i) => i.id === initialSelectedId) ?? null;
    }
    // Default: first in the visible list
    return visible[0] ?? null;
  }, [initialSelectedId, interactions, visible]);

  const selectedHousehold = selectedIx?.household_id
    ? householdMap.get(selectedIx.household_id)
    : null;
  const selectedLead = selectedHousehold
    ? leadsByHousehold.get(selectedHousehold.id)
    : null;

  // Navigation helpers — URL-driven
  function selectInteraction(id: string) {
    if (id === selectedIx?.id) return;
    if (composerDirty && !window.confirm("You have an unsent reply open. Switch messages and discard it?")) {
      return;
    }
    setComposerDirty(false);
    const params = new URLSearchParams(searchParams.toString());
    params.set("id", id);
    setActiveDraftIdx(0); // reset draft selection
    startTransition(() => {
      router.push(`/inbox?${params.toString()}`);
    });
  }

  function selectLane(newLane: Lane) {
    if (composerDirty && !window.confirm("You have an unsent reply open. Switch lanes and discard it?")) {
      return;
    }
    setComposerDirty(false);
    const params = new URLSearchParams(searchParams.toString());
    params.set("lane", newLane);
    params.delete("id");
    startTransition(() => {
      router.push(`/inbox?${params.toString()}`);
    });
  }

  // Phone master-detail: an explicit selection shows the message, otherwise the
  // list. Back clears it. (On desktop these classes do nothing — all panes show.)
  const hasSelection = Boolean(initialSelectedId);
  function backToList() {
    if (composerDirty && !window.confirm("You have an unsent reply open. Go back and discard it?")) {
      return;
    }
    setComposerDirty(false);
    const params = new URLSearchParams(searchParams.toString());
    params.delete("id");
    startTransition(() => {
      router.push(`/inbox?${params.toString()}`);
    });
  }

  return (
    <div className={`inbox-grid ${hasSelection ? "show-detail" : "show-list"}`}>
      {/* ─── LEFT — Triage banner + lane tabs + message list ─── */}
      <div
        className="inbox-list"
        style={{
          borderRight: "1px solid var(--border)",
          background: "var(--surface)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <TriageBanner
          today={buckets.today.length}
          week={buckets.week.length}
          later={buckets.later.length}
        />
        <LaneTabs
          buckets={buckets}
          activeLane={lane}
          onChange={selectLane}
        />
        <div data-tour="inbox-list" style={{ flex: 1, overflow: "auto" }}>
          {visible.length === 0 ? (
            <EmptyLane lane={lane} />
          ) : (
            visible.map((ix) => {
              const household = householdMap.get(ix.household_id ?? "");
              return (
                <MessageRow
                  key={ix.id}
                  ix={ix}
                  household={household}
                  active={selectedIx?.id === ix.id}
                  onClick={() => selectInteraction(ix.id)}
                />
              );
            })
          )}
        </div>
      </div>

      {/* ─── MIDDLE — Focused message + drafts ─── */}
      <div className="inbox-detail" style={{ overflow: "auto", padding: 24 }}>
        <button
          className="inbox-mobile-back"
          onClick={backToList}
          style={{
            alignItems: "center",
            gap: 6,
            background: "transparent",
            border: "1px solid var(--border)",
            borderRadius: 7,
            padding: "7px 12px",
            fontSize: 13,
            fontWeight: 500,
            color: "var(--text-muted)",
            cursor: "pointer",
            marginBottom: 14,
          }}
        >
          ← Inbox
        </button>
        {selectedIx ? (
          <FocusedMessage
            ix={selectedIx}
            household={selectedHousehold}
            lead={selectedLead}
            activeDraftIdx={activeDraftIdx}
            onDraftChange={setActiveDraftIdx}
            emailLive={emailLive}
            onComposerDirtyChange={setComposerDirty}
          />
        ) : (
          <NothingSelected />
        )}
      </div>

      {/* ─── RIGHT — Mini customer card ─── */}
      <div
        className="inbox-aside"
        style={{
          borderLeft: "1px solid var(--border)",
          background: "var(--bg-subtle)",
          overflow: "auto",
          padding: 18,
        }}
      >
        {selectedHousehold ? (
          <MiniCustomerCard
            household={selectedHousehold}
            lead={selectedLead}
          />
        ) : (
          <div style={{ fontSize: 12, color: "var(--text-subtle)" }}>
            Select a message to see customer details.
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Triage banner ──────────────────────────────────────────────────────
function TriageBanner({
  today,
  week,
  later,
}: {
  today: number;
  week: number;
  later: number;
}) {
  const total = today + week + later;
  return (
    <div
      style={{
        background:
          "linear-gradient(135deg, var(--tg-primary-dark) 0%, #0E1837 100%)",
        color: "white",
        padding: "14px 16px",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: "-40%",
          right: "-20%",
          width: 180,
          height: 180,
          background:
            "radial-gradient(circle, var(--tg-accent) 0%, transparent 70%)",
          opacity: 0.12,
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 6,
          position: "relative",
        }}
      >
        <SparklesIcon width={13} height={13} style={{ color: "var(--tg-accent-light)" }} />
        <span
          style={{
            fontSize: 10.5,
            fontWeight: 600,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "var(--tg-accent-light)",
          }}
        >
          Luna · Triaged your inbox
        </span>
      </div>
      <div
        style={{
          fontSize: 13,
          lineHeight: 1.5,
          color: "rgba(255, 255, 255, 0.92)",
          position: "relative",
        }}
      >
        Sorted <strong>{total}</strong> inbound messages. <strong>{today}</strong>{" "}
        need attention today, <strong>{week}</strong> can wait until later this
        week, <strong>{later}</strong> are nice-to-have. Drafts already prepared
        for the urgent ones.
      </div>
    </div>
  );
}

// ─── Lane tabs ──────────────────────────────────────────────────────────
function LaneTabs({
  buckets,
  activeLane,
  onChange,
}: {
  buckets: { today: Interaction[]; week: Interaction[]; later: Interaction[]; untriaged: Interaction[] };
  activeLane: Lane;
  onChange: (l: Lane) => void;
}) {
  const lanes: { id: Lane; label: string; count: number; tone: string }[] = [
    {
      id: "today",
      label: "Today",
      count: buckets.today.length,
      tone: "var(--error)",
    },
    {
      id: "week",
      label: "This week",
      count: buckets.week.length,
      tone: "var(--warning)",
    },
    {
      id: "later",
      label: "Later",
      count: buckets.later.length,
      tone: "var(--text-muted)",
    },
    {
      id: "all",
      label: "All",
      count:
        buckets.today.length +
        buckets.week.length +
        buckets.later.length +
        buckets.untriaged.length,
      tone: "var(--text-subtle)",
    },
  ];

  return (
    <div
      data-tour="inbox-lanes"
      style={{
        display: "flex",
        borderBottom: "1px solid var(--border)",
        background: "var(--surface)",
      }}
    >
      {lanes.map((l) => {
        const active = activeLane === l.id;
        return (
          <button
            key={l.id}
            onClick={() => onChange(l.id)}
            style={{
              flex: 1,
              background: "transparent",
              border: "none",
              borderBottom: active
                ? `2px solid ${l.tone}`
                : "2px solid transparent",
              padding: "10px 6px",
              cursor: "pointer",
              fontFamily: "inherit",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 2,
              transition: "background 0.12s ease",
            }}
          >
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: active ? "var(--text)" : "var(--text-muted)",
                letterSpacing: "0.02em",
              }}
            >
              {l.label}
            </span>
            <span
              style={{
                fontSize: 10.5,
                fontWeight: 700,
                fontFamily: '"JetBrains Mono", monospace',
                color: active ? l.tone : "var(--text-subtle)",
              }}
            >
              {l.count}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ─── Message row in the list ────────────────────────────────────────────
function MessageRow({
  ix,
  household,
  active,
  onClick,
}: {
  ix: Interaction;
  household?: Household;
  active: boolean;
  onClick: () => void;
}) {
  const name = household?.display_name ?? "Unknown";

  return (
    <button
      onClick={onClick}
      style={{
        width: "100%",
        textAlign: "left",
        background: active ? "var(--bg-subtle)" : "transparent",
        border: "none",
        borderBottom: "1px solid var(--border)",
        borderLeft: active
          ? "3px solid var(--tg-accent)"
          : "3px solid transparent",
        padding: "12px 14px 12px 11px",
        cursor: "pointer",
        fontFamily: "inherit",
        display: "block",
        transition: "background 0.1s ease",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 9,
          marginBottom: 6,
        }}
      >
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: 8,
            background: avatarColor(name),
            color: "white",
            fontWeight: 600,
            fontSize: 10,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          {initials(name)}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <span
              style={{
                fontSize: 13,
                fontWeight: !ix.is_read ? 700 : 500,
                color: "var(--text)",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                flex: 1,
                minWidth: 0,
              }}
            >
              {name}
            </span>
            {!ix.is_read && (
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: "var(--tg-accent)",
                  flexShrink: 0,
                }}
              />
            )}
            <span
              style={{
                fontSize: 10.5,
                color: "var(--text-subtle)",
                fontFamily: '"JetBrains Mono", monospace',
                flexShrink: 0,
              }}
            >
              {relativeTime(ix.occurred_at)}
            </span>
          </div>
          <div
            style={{
              fontSize: 12,
              color: "var(--text-muted)",
              marginTop: 1,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              fontWeight: !ix.is_read ? 500 : 400,
            }}
          >
            {ix.subject ?? "(no subject)"}
          </div>
        </div>
      </div>
      <div
        style={{
          fontSize: 11.5,
          color: "var(--text-muted)",
          lineHeight: 1.4,
          marginLeft: 37,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {ix.body_summary ?? (ix.body ? ix.body.slice(0, 100) : "")}
      </div>
      {ix.ai_reason && (
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            marginTop: 6,
            marginLeft: 37,
            fontSize: 10.5,
            color: "var(--tg-accent-dark)",
            fontStyle: "italic",
          }}
        >
          <SparklesIcon width={10} height={10} />
          {ix.ai_reason}
        </div>
      )}
    </button>
  );
}

// ─── Empty lane ─────────────────────────────────────────────────────────
function EmptyLane({ lane }: { lane: Lane }) {
  const messages: Record<Lane, string> = {
    today: "Nothing urgent. Luna will let you know when something arrives.",
    week: "No medium-priority messages this week.",
    later: "No low-priority items in the queue.",
    all: "Inbox is empty.",
  };
  return (
    <div
      style={{
        padding: "60px 20px",
        textAlign: "center",
        color: "var(--text-subtle)",
        fontSize: 12.5,
      }}
    >
      {messages[lane]}
    </div>
  );
}

// ─── Focused message + drafts ───────────────────────────────────────────
function FocusedMessage({
  ix,
  household,
  lead,
  activeDraftIdx,
  onDraftChange,
  emailLive,
  onComposerDirtyChange,
}: {
  ix: Interaction;
  household: Household | null | undefined;
  lead: Contact | null | undefined;
  activeDraftIdx: number;
  onDraftChange: (i: number) => void;
  emailLive: boolean;
  onComposerDirtyChange: (dirty: boolean) => void;
}) {
  // Live drafts from Luna (null until the agent presses Regenerate). The
  // hand-crafted library is the instant default underneath.
  const [liveDrafts, setLiveDrafts] = useState<DraftSet | null>(null);
  const [drafting, setDrafting] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);

  // Editing state for "Edit before sending" — the draft becomes a textarea and
  // Send uses the edited body.
  const [editing, setEditing] = useState(false);
  const [editedBody, setEditedBody] = useState("");
  const [sendNote, setSendNote] = useState<string | null>(null);
  // Whether the open composer holds unsent work, tracked here so the draft-tab
  // switch below can ask before discarding it, and reported up so the message
  // and lane switches in the parent can do the same.
  const [editDirty, setEditDirty] = useState(false);
  useEffect(() => {
    onComposerDirtyChange(editDirty);
  }, [editDirty, onComposerDirtyChange]);

  // Reset live drafts and editing whenever the selected message changes. The
  // parent has already confirmed any discard by the time ix.id changes.
  useEffect(() => {
    setLiveDrafts(null);
    setDraftError(null);
    setEditing(false);
    setEditDirty(false);
    setSendNote(null);
  }, [ix.id]);

  // Switching draft tabs discards an in-progress edit (it belonged to the
  // previous draft's body). The tab buttons confirm first when it's dirty.
  useEffect(() => {
    setEditing(false);
    setEditDirty(false);
    setSendNote(null);
  }, [activeDraftIdx]);

  async function regenerate() {
    setDrafting(true);
    setDraftError(null);
    try {
      const res = await fetch(`/api/inbox/${ix.id}/drafts`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok && Array.isArray(data.drafts) && data.drafts.length) {
        setLiveDrafts({ drafts: data.drafts });
        onDraftChange(0);
      } else {
        setDraftError(data.error || "Couldn't draft just now. Showing the prepared replies.");
      }
    } catch {
      setDraftError("Network error. Showing the prepared replies.");
    } finally {
      setDrafting(false);
    }
  }

  const draftSet = liveDrafts ?? getDrafts(ix);
  const isLive = liveDrafts !== null;
  const draft = draftSet.drafts[activeDraftIdx] ?? draftSet.drafts[0];
  const hasMultipleDrafts = draftSet.drafts.length > 1;

  // With a configured provider the button genuinely sends (consent-checked
  // and recorded server-side); otherwise it opens the user's own mail client
  // pre-addressed. Either way a human pressed Send — nothing sends silently.
  const leadEmail = lead?.email ?? null;
  const [sending, setSending] = useState(false);

  function openMailto(subject: string, body: string) {
    const params = new URLSearchParams();
    params.set("subject", subject);
    params.set("body", body);
    window.location.href = `mailto:${leadEmail}?${params.toString()}`;
    setSendNote("Draft opened in your email app, addressed and ready to send.");
  }

  async function sendReply() {
    const body = editing ? editedBody : draft.body;
    const subject = ix.subject ? `Re: ${ix.subject}` : "Re: your message";
    if (!leadEmail) {
      setSendNote("No email address on file for this customer. Add one on their record first.");
      return;
    }
    if (!emailLive) {
      openMailto(subject, body);
      return;
    }
    setSending(true);
    setSendNote(null);
    try {
      const res = await fetch("/api/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contact_id: lead?.id,
          household_id: ix.household_id,
          subject,
          body,
          purpose: "operational",
          context: "inbox_reply",
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        not_configured?: boolean;
        to?: string;
      };
      if (data.ok) {
        setSendNote(`Sent to ${data.to} and recorded on the timeline.`);
        setEditing(false);
      } else if (data.not_configured) {
        openMailto(subject, body); // provider vanished mid-session — degrade
      } else {
        setSendNote(data.error || "The send failed. Nothing was delivered.");
      }
    } catch {
      setSendNote("Network error — the send did not go through.");
    } finally {
      setSending(false);
    }
  }
  function toggleEdit() {
    setSendNote(null);
    if (editing) {
      if (editDirty && !window.confirm("Discard your edits to this reply?")) return;
      setEditing(false);
      setEditDirty(false);
    } else {
      setEditedBody(draft.body);
      setEditing(true);
    }
  }

  return (
    <div style={{ maxWidth: 760, margin: "0 auto" }}>
      {/* Inbound message */}
      <div
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 12,
          padding: 20,
          marginBottom: 16,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 14,
            marginBottom: 14,
            paddingBottom: 14,
            borderBottom: "1px solid var(--border)",
          }}
        >
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              background: avatarColor(household?.display_name ?? "Unknown"),
              color: "white",
              fontWeight: 600,
              fontSize: 13,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            {initials(household?.display_name ?? "?")}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 15,
                fontWeight: 700,
                color: "var(--text)",
                letterSpacing: "-0.005em",
              }}
            >
              {household?.display_name ?? "Unknown"}
            </div>
            <div
              style={{
                fontSize: 12,
                color: "var(--text-muted)",
                marginTop: 2,
              }}
            >
              {lead?.email ?? ""} · {channelLabel(ix.channel)} ·{" "}
              {relativeTime(ix.occurred_at)}
            </div>
          </div>
          {ix.ai_priority && (
            <span
              style={{
                fontSize: 10,
                padding: "3px 9px",
                borderRadius: 5,
                background:
                  ix.ai_priority === "today"
                    ? "rgba(239, 68, 68, 0.08)"
                    : ix.ai_priority === "week"
                    ? "rgba(245, 158, 11, 0.1)"
                    : "var(--bg-subtle)",
                color:
                  ix.ai_priority === "today"
                    ? "var(--error)"
                    : ix.ai_priority === "week"
                    ? "var(--warning)"
                    : "var(--text-muted)",
                fontWeight: 600,
                letterSpacing: "0.05em",
                textTransform: "uppercase",
                whiteSpace: "nowrap",
              }}
            >
              {ix.ai_priority}
            </span>
          )}
        </div>

        {ix.subject && (
          <div
            style={{
              fontSize: 16,
              fontWeight: 600,
              color: "var(--text)",
              marginBottom: 12,
              letterSpacing: "-0.01em",
            }}
          >
            {ix.subject}
          </div>
        )}

        {ix.body && (
          <div
            style={{
              fontSize: 14,
              lineHeight: 1.65,
              color: "var(--text)",
              whiteSpace: "pre-wrap",
            }}
          >
            {ix.body}
          </div>
        )}

        {ix.ai_reason && (
          <div
            style={{
              marginTop: 14,
              padding: "10px 12px",
              background: "rgba(0, 180, 216, 0.06)",
              border: "1px solid rgba(0, 180, 216, 0.18)",
              borderRadius: 8,
              fontSize: 12,
              color: "var(--tg-accent-dark)",
              display: "flex",
              alignItems: "center",
              gap: 7,
            }}
          >
            <SparklesIcon width={12} height={12} />
            <span>
              <strong style={{ fontWeight: 600 }}>Luna's read:</strong>{" "}
              {ix.ai_reason}
            </span>
          </div>
        )}
      </div>

      {/* Drafts */}
      <div
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 12,
          padding: 20,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 14,
          }}
        >
          <div
            style={{
              width: 22,
              height: 22,
              borderRadius: 6,
              background:
                "linear-gradient(135deg, var(--tg-primary) 0%, var(--tg-accent) 100%)",
              color: "white",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <SparklesIcon width={11} height={11} />
          </div>
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: "var(--text)",
              letterSpacing: "0.05em",
              textTransform: "uppercase",
            }}
          >
            Luna · {draftSet.drafts.length}{" "}
            {draftSet.drafts.length === 1 ? "draft" : "drafts ranked by fit"}
          </div>
          {isLive && (
            <span
              style={{
                fontSize: 9.5,
                fontWeight: 600,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: "var(--success)",
                background: "rgba(16, 185, 129, 0.1)",
                padding: "2px 7px",
                borderRadius: 999,
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <span
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: "50%",
                  background: "var(--success)",
                }}
              />
              Live
            </span>
          )}
        </div>

        {hasMultipleDrafts && (
          <div
            style={{
              display: "flex",
              gap: 6,
              marginBottom: 14,
              flexWrap: "wrap",
            }}
          >
            {draftSet.drafts.map((d, i) => (
              <button
                key={i}
                onClick={() => {
                  if (i === activeDraftIdx) return;
                  if (editDirty && !window.confirm("You've edited this draft. Switch and discard your changes?")) {
                    return;
                  }
                  onDraftChange(i);
                }}
                style={{
                  background:
                    activeDraftIdx === i ? "var(--tg-primary)" : "var(--bg-subtle)",
                  color:
                    activeDraftIdx === i ? "white" : "var(--text-muted)",
                  border: `1px solid ${
                    activeDraftIdx === i ? "var(--tg-primary)" : "var(--border)"
                  }`,
                  borderRadius: 6,
                  padding: "5px 10px",
                  fontSize: 11.5,
                  fontWeight: 500,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                }}
              >
                <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 10.5 }}>
                  {d.confidence}%
                </span>
                {d.label}
              </button>
            ))}
          </div>
        )}

        {/* Active draft */}
        <div
          style={{
            background: "rgba(0, 180, 216, 0.04)",
            border: "1px solid rgba(0, 180, 216, 0.15)",
            borderRadius: 10,
            padding: 14,
            marginBottom: 12,
          }}
        >
          <div
            style={{
              fontSize: 11.5,
              color: "var(--tg-accent-dark)",
              fontStyle: "italic",
              marginBottom: 12,
              lineHeight: 1.45,
            }}
          >
            <strong style={{ fontWeight: 600, fontStyle: "normal" }}>
              This one because:
            </strong>{" "}
            {draft.rationale}
          </div>
          {editing ? (
            // The full composer, seeded with Luna's draft: formatting,
            // attachments, emoji and a rewrite pass, rather than a textarea.
            <EmailComposer
              toLabel={lead ? [lead.first_name, lead.last_name].filter(Boolean).join(" ") : leadEmail ?? "this customer"}
              toEmail={leadEmail}
              contactId={lead?.id}
              householdId={ix.household_id ?? undefined}
              defaultSubject={ix.subject ? `Re: ${ix.subject}` : "Re: your message"}
              defaultBody={editedBody}
              context="inbox_reply"
              emailLive={emailLive}
              note="goes on their timeline"
              onDirtyChange={setEditDirty}
              onSent={() => {
                setEditing(false);
                setEditDirty(false);
                setSendNote("Sent and recorded on the timeline.");
              }}
              onCancel={() => {
                if (editDirty && !window.confirm("Discard your edits to this reply?")) return;
                setEditing(false);
                setEditDirty(false);
              }}
            />
          ) : (
            <div
              style={{
                fontSize: 14,
                lineHeight: 1.6,
                color: "var(--text)",
                whiteSpace: "pre-wrap",
                fontFamily: '"Inter", system-ui, -apple-system, sans-serif',
              }}
            >
              {draft.body}
            </div>
          )}
        </div>

        <div
          style={{
            display: editing ? "none" : "flex",
            gap: 8,
            paddingTop: 4,
          }}
        >
          <button
            onClick={sendReply}
            disabled={!leadEmail || sending}
            title={
              !leadEmail
                ? "No email address on file for this customer"
                : emailLive
                  ? `Sends for real to ${leadEmail} and records it on the timeline`
                  : `Opens your email app addressed to ${leadEmail}`
            }
            style={{
              background: leadEmail ? "var(--tg-primary)" : "var(--bg-subtle)",
              color: leadEmail ? "white" : "var(--text-subtle)",
              border: "none",
              borderRadius: 7,
              padding: "8px 14px",
              fontSize: 13,
              fontWeight: 600,
              cursor: leadEmail ? "pointer" : "default",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <SendIcon width={13} height={13} />
            {sending ? "Sending…" : "Send as is"}
          </button>
          <button
            onClick={toggleEdit}
            style={{
              background: editing ? "var(--bg-subtle)" : "var(--surface)",
              color: "var(--text)",
              border: "1px solid var(--border)",
              borderRadius: 7,
              padding: "8px 14px",
              fontSize: 13,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Edit before sending
          </button>
          <button
            onClick={regenerate}
            disabled={drafting}
            title="Draft fresh replies with Luna, grounded in this customer's record"
            style={{
              background: drafting ? "var(--bg-subtle)" : "transparent",
              color: "var(--text-muted)",
              border: "1px solid var(--border)",
              borderRadius: 7,
              padding: "8px 14px",
              fontSize: 13,
              fontWeight: 500,
              cursor: drafting ? "default" : "pointer",
              marginLeft: "auto",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              opacity: drafting ? 0.8 : 1,
            }}
          >
            <SparklesIcon width={13} height={13} />
            {drafting ? "Luna's drafting…" : isLive ? "Regenerate" : "Draft with Luna"}
          </button>
        </div>

        {sendNote && (
          <div style={{ marginTop: 10, fontSize: 11.5, color: leadEmail ? "var(--success)" : "var(--warning)" }}>
            {sendNote}
          </div>
        )}
        {draftError && (
          <div
            style={{
              marginTop: 10,
              fontSize: 11.5,
              color: "var(--warning)",
            }}
          >
            {draftError}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Nothing selected ───────────────────────────────────────────────────
function NothingSelected() {
  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        color: "var(--text-subtle)",
        fontSize: 13,
        textAlign: "center",
        padding: 40,
      }}
    >
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: 14,
          background: "var(--bg-subtle)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 14,
        }}
      >
        <SparklesIcon width={22} height={22} style={{ color: "var(--text-subtle)" }} />
      </div>
      <div style={{ fontWeight: 600, color: "var(--text)", fontSize: 14, marginBottom: 4 }}>
        Inbox zero
      </div>
      <div style={{ maxWidth: 280, lineHeight: 1.5 }}>
        Pick a message on the left to see Luna&apos;s suggested replies.
      </div>
    </div>
  );
}

// ─── Mini customer card ─────────────────────────────────────────────────
function MiniCustomerCard({
  household,
  lead,
}: {
  household: Household;
  lead?: Contact | null;
}) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 11,
            background: avatarColor(household.display_name),
            color: "white",
            fontWeight: 600,
            fontSize: 13,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {initials(household.display_name)}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: "var(--text)",
              letterSpacing: "-0.005em",
            }}
          >
            {household.display_name}
          </div>
          <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 1 }}>
            {household.city ?? ""} · {household.household_type ?? ""}
          </div>
        </div>
      </div>

      {(household.tags ?? []).length > 0 && (
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 14 }}>
          {household.tags.map((tag) => (
            <span
              key={tag}
              style={{
                fontSize: 10.5,
                padding: "2px 7px",
                borderRadius: 5,
                background:
                  tag === "VIP"
                    ? "rgba(239, 68, 68, 0.08)"
                    : "rgba(0, 180, 216, 0.08)",
                color: tag === "VIP" ? "var(--error)" : "var(--tg-accent-dark)",
                border: `1px solid ${
                  tag === "VIP" ? "rgba(239, 68, 68, 0.2)" : "rgba(0, 180, 216, 0.2)"
                }`,
                fontWeight: 600,
              }}
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      <div
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 10,
          padding: 14,
          marginBottom: 10,
        }}
      >
        <div style={miniStatRow()}>
          <span style={miniLabel()}>Lifetime value</span>
          <span style={miniValue()}>{formatMoney(household.lifetime_value)}</span>
        </div>
        <div style={miniStatRow()}>
          <span style={miniLabel()}>Trips booked</span>
          <span style={miniValue()}>{household.trips_count}</span>
        </div>
        <div style={miniStatRow()}>
          <span style={miniLabel()}>Customer since</span>
          <span style={miniValue()}>
            {household.customer_since
              ? new Date(household.customer_since).toLocaleDateString("en-GB", {
                  month: "short",
                  year: "numeric",
                })
              : "—"}
          </span>
        </div>
        {household.next_departure && (
          <div style={miniStatRow(true)}>
            <span style={miniLabel()}>Next departure</span>
            <span style={miniValue()}>
              {new Date(household.next_departure).toLocaleDateString("en-GB", {
                day: "numeric",
                month: "short",
              })}
            </span>
          </div>
        )}
      </div>

      {household.ai_brief && (
        <div
          style={{
            background: "rgba(0, 180, 216, 0.04)",
            border: "1px solid rgba(0, 180, 216, 0.15)",
            borderRadius: 10,
            padding: 12,
            marginBottom: 10,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              marginBottom: 6,
            }}
          >
            <SparklesIcon
              width={11}
              height={11}
              style={{ color: "var(--tg-accent-dark)" }}
            />
            <span
              style={{
                fontSize: 9.5,
                fontWeight: 600,
                color: "var(--tg-accent-dark)",
                letterSpacing: "0.06em",
                textTransform: "uppercase",
              }}
            >
              Luna&apos;s read
            </span>
          </div>
          <div
            style={{
              fontSize: 11.5,
              color: "var(--text)",
              lineHeight: 1.5,
            }}
          >
            {household.ai_brief.length > 200
              ? household.ai_brief.slice(0, 200) + "…"
              : household.ai_brief}
          </div>
        </div>
      )}

      {household.notes && (
        <div
          style={{
            background: "rgba(245, 158, 11, 0.05)",
            border: "1px solid rgba(245, 158, 11, 0.15)",
            borderRadius: 10,
            padding: 12,
            marginBottom: 10,
          }}
        >
          <div
            style={{
              fontSize: 9.5,
              fontWeight: 600,
              color: "var(--warning)",
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              marginBottom: 5,
            }}
          >
            Heads-up
          </div>
          <div style={{ fontSize: 11.5, color: "var(--text)", lineHeight: 1.5 }}>
            {household.notes}
          </div>
        </div>
      )}

      <Link
        href={`/customers/${household.id}`}
        style={{
          display: "block",
          textAlign: "center",
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 7,
          padding: "8px 12px",
          fontSize: 12.5,
          fontWeight: 500,
          color: "var(--text)",
          textDecoration: "none",
          transition: "background 0.12s ease",
        }}
      >
        Open full record →
      </Link>
    </div>
  );
}

function miniStatRow(last = false): React.CSSProperties {
  return {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "5px 0",
    borderBottom: last ? "none" : "1px solid var(--border)",
  };
}
function miniLabel(): React.CSSProperties {
  return {
    fontSize: 11,
    color: "var(--text-subtle)",
    fontWeight: 500,
  };
}
function miniValue(): React.CSSProperties {
  return {
    fontSize: 12.5,
    fontWeight: 600,
    color: "var(--text)",
    fontFamily: '"JetBrains Mono", monospace',
  };
}
