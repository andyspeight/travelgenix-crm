# Blueprint gap review — Luna Work vs the AI-First Travel CRM Blueprint

**Date:** 23 July 2026
**Input:** "Travelgenix AI-First Travel CRM — Comprehensive Product Blueprint" (43 pages, 30 sections)
**Purpose:** line up the live build (travelgenix-crm.vercel.app) against the blueprint, confirm what is
already covered, name what is missing, and set the build order for closing the gaps that matter.

---

## 1. The one-paragraph verdict

The build is squarely on the blueprint's philosophy and ahead of it in places: the travel-native data
model (households, trips, passengers, preferences-with-provenance), the hybrid AI pattern
(deterministic scores that explain themselves + AI prose on top), the approval-first act layer, and
plain-English control through Ask Luna are all things the blueprint asks for — and they exist today.
The real gaps are at the **front door** (no structured enquiry object, no AI enquiry extraction, no
first-response clock), around the **quote** (no quote object, so no Quote Rescue), in **consent
granularity**, and at the **ecosystem seam** (no event layer connecting Travelify and Luna Marketing).
Nothing in the blueprint contradicts a decision already locked; it mostly confirms the roadmap and
sharpens the order.

---

## 2. What the blueprint asks for that we already have

| Blueprint ask | Where it lives today |
|---|---|
| Connected travel objects, not flat contacts (§3) | 15-table schema: households, contacts (roles), trips, trip_passengers, trip_components, preferences, interactions, tasks, journeys, segments |
| Household as first-class data (§3, differentiator 8) | Household model with rollups (lifetime_value, trips_count, next_departure) recomputed on stage change; household graph on the 360 |
| Preferences with explicit/inferred provenance (§3) | `preferences.source` ('manual' / 'inferred' / 'survey') + `confidence` — exactly the blueprint's rule that an inferred preference must show source and confidence |
| Compact navigation, LUNA everywhere (§4) | 9-item sidebar; Ask Luna floats globally (Cmd/Ctrl+K), not a separate AI module |
| Today screen (§4) | Dashboard: morning briefing, KPIs, pipeline bars, departures, needs-attention, auto-pilot strip |
| Customer 360 as intelligent briefing (§5) | AI brief (Sonnet) + deterministic risk/opportunity scores, timeline, editable preferences/household, next-steps panel with one-click "Do" |
| Relationship health that explains itself (§5) | Scores are pure functions (`lib/scoring/customer.ts`) with named signals; the brief narrates them, never invents them |
| Travel-specific pipeline (§7) | Trips Kanban, 7 travel stages (enquiry → quoted → booked → pre-departure → travelling → returned; cancelled hidden) |
| Inbox with AI reply drafts (§8) | Three-pane triage, ranked Claude drafts with fact-grounding, library fallback, send/edit wired |
| Tasks, queues (§9) | /tasks work queue with due buckets, snooze, complete; journeys write into it |
| Lifecycle automation library (§10) | Journeys auto-pilot: days-to-departure, days-after-return, passport-expiring, no-contact triggers; runs reviewable (send/skip) |
| LUNA Ask mode (§16) | 9 query tools + 2-pass router + follow-up threads |
| LUNA Do mode with approval (§16, §17) | Act layer on answers: email all / add to journey / add tag — always human-triggered, never autonomous |
| AI guardrails (§17) | Server-side keys, prompt-injection decline clause, fails closed, token caps, timeouts, rate limiting, audit-to-interactions, deterministic core with AI on top — the §27 "do not hide weak workflows behind AI" rule is the build's founding pattern |
| Prebuilt travel reports (§18) | 9 reports + `business_report` Ask tool (natural-language reporting, §18's closing ask) |
| Plain-English CRM control (differentiator 10) | NL segmentation (Haiku → validated tokens), NL reporting, Ask+act |
| Responsive mobile (§24) | Off-canvas drawer, collapsing grids, stacked inbox |
| Onboarding (§25, partially) | In-app product tour + illustrated PDF user guide |
| What NOT to build (§27) | Compliant: no booking admin, no campaign editor, no autonomous AI actions, deterministic core |

**Blueprint differentiators already strong:** #8 Household intelligence, #10 Plain-English control,
#11 One continuous timeline (for CRM-native events).

---

## 3. The gaps — tiered

### Tier A — missing pieces of the blueprint's *initial commercial release* (§28)

These are the ones that matter now; everything else below is officially "growth" or "advanced".

1. **Enquiry object + AI extraction + response clock (§3, §6).** Today an enquiry is just a trip at
   `enquiry` stage. The blueprint wants a structured enquiry: source, destination interest, dates +
   flexibility, party composition, budget, must-haves/deal-breakers, **original customer wording**,
   AI summary, and *separate* qualification scores (likelihood, value, urgency, fit — "do not collapse
   everything into one mysterious score", which is already our scoring house style). Plus a
   first-response target with a countdown. This is the front door of the whole lifecycle and the
   biggest single gap.

2. **Quote object → Quote Rescue (§3, §7, differentiator 3).** No quote tracking exists (version,
   sent date, expiry, value, customer response, decline reason). Without it there is no "this £8,600
   quote has been viewed four times with no follow-up" moment — one of the blueprint's signature
   demos. Deterministic at-risk signals + a Luna-suggested intervention fit our existing hybrid
   pattern exactly.

3. **Consent per channel with evidence (§3, §19).** We have two booleans (`marketing_opt_in`,
   `gdpr_consent`). The blueprint requires channel-level consent (email/SMS/WhatsApp/phone/post +
   profiling) each recording source, wording, date and evidence. This is a compliance requirement
   (PECR) *and* the prerequisite for the Luna Marketing audience handoff — an audience can't be sent
   without a consent check.

4. **The event layer (§2, differentiator 12).** The "shared data loop" (`enquiry.created`,
   `quote.sent`, `booking.created`, `campaign.clicked`…) doesn't exist. The blueprint calls this
   "one of Travelgenix's strongest technical assets" — it is the seam that makes CRM + Travelify +
   Luna Marketing feel like one product. We can't control when Travelify/Luna Marketing emit events,
   but we can define the contract and start emitting/ingesting our own events now, so the native
   hooks land into a ready socket later.

5. **LUNA Suggest mode as a feed (§16).** Ask ✅ and Do ✅, but Suggest is only implicit
   (needs-attention list, next-steps panel). The blueprint wants proactive, explained
   recommendations — "I noticed…" — with why/source/confidence and a one-click action. All the
   detectors can be deterministic (same pattern as scoring) with Haiku narration.

6. **Data-quality assistant (§25, §28).** Listed in the initial release: duplicates, missing owners,
   invalid emails, expired passports, records needing review. We surface passport expiry only.
   A "CRM health" report is cheap on our data and is also the post-import report when CSV import lands.

### Tier B — differentiators that are partial

| # | Differentiator | State | What closes it |
|---|---|---|---|
| 1 | Customer Travel Memory | Partial — preferences + AI brief exist, but no assembled, **cited** memory panel | A 360 "Travel memory" section built from trips + preferences + interactions, each line citing its source record |
| 2 | Booking-native 360 | Blocked externally — Travelify Order Handoff is single-order retrieval only | Event layer + Travelify sync when bulk retrieval exists; keep displaying, never own, booking truth |
| 4 | Rebooking window | Partial — gone-quiet tool + no-contact journey | Deterministic per-household rebooking window from booking cadence (`last_booking_at`, trip history); expose as 360 fact, Suggest item and journey trigger |
| 6 | Margin-aware recommendations | Partial — no margin/commission captured on trips | Commission/margin fields on trips (already on the backlog: "commission capture unlocks margin reports") |
| 7 | Automatic marketing audiences | Partial — segments are saved in-CRM | Consent check + audience handoff event to Luna Marketing; engagement events back |
| 9 | Travel trend detection | Missing | Deterministic trend deltas (destination demand, response times, conversion) narrated by Luna; feeds the Suggest feed and Reports |

### Tier C — deliberately later (blueprint agrees: §28 growth/advanced)

Service cases + SLAs + travel-aware priority (§11), WhatsApp/SMS + universal inbox (§8), sales
sequences with stop conditions, natural-language workflow creation (§9 — high wow, moderate lift once
journeys accept arbitrary configs), forecasting (§7), group travel (§12), corporate/B2B (§13), forms +
document management + AI document processing (§14), customer portal, partner management, custom
objects, sandbox, developer API (§21). None of these should jump the queue; the blueprint itself
sequences them after the Tier A items.

### Production hardening (unchanged, carried from PROJECT-STATUS)

Auth + RLS before multi-tenant or client-facing use; Upstash for the rate limiter; passport
field-level encryption (§19 — schema comment already promises it); cron trigger for journeys;
Supabase key rotation.

---

## 4. Ecosystem linkage — the design rule

The blueprint's §2 boundary is worth writing on the wall, because we already follow it and must keep
following it:

- **Travelify owns transaction truth.** We display bookings, margins, payments; we never maintain a
  competing copy. A "view in Travelify" affordance belongs on every booking surface.
- **Luna CRM owns relationship truth.** Customers, households, enquiries, preferences, consent,
  interactions, health, next actions.
- **Luna Marketing owns marketing execution.** We supply audiences + consent + outcomes; it returns
  engagement events and attribution.
- **They talk through events, not imports.** The event layer (Tier A #4) is that contract.

---

## 5. Recommended build order

Each step is one to two sessions, keeps the "AI-first, powerful, simple" mantra, and uses the proven
patterns (deterministic core + AI narration; new Ask tools registered, not wired).

1. **Enquiries** — `enquiries` table + capture UI + Luna extraction from pasted email/form text
   (review-before-save, per §8's approval rule) + separate qualification scores + first-response
   clock on Today. Emits `enquiry.created` as the first event.
2. **Quotes + Quote Rescue** — `quotes` table, quote timeline on trip/360, deterministic at-risk
   signals, Suggest-feed rescue recommendations, `quote.sent`/`quote.expiring` events.
3. **Consent v2** — per-channel consent records with evidence; Settings + 360 UI; segmentation and
   the act layer consult it before any email action.
4. **Event spine** — `events` table + emitters on existing actions (stage change, task done, journey
   run, brief generated); the Travelify/Luna Marketing socket.
5. **Luna Suggest feed** — detector library (quote risk, rebooking window, gone-quiet, data quality,
   passport) + Haiku narration + one-click acts on Today.
6. **Travel Memory panel + rebooking window** on the 360 (both mostly read from data that exists
   after steps 1–2).
7. **CSV import + AI mapping + post-import health check** — the adoption unlock (§25).

Then reassess: service cases vs NL journey builder vs forecasting, based on what sales conversations
demand.

---

## 6. Scorecard summary

| Blueprint area (§) | Coverage |
|---|---|
| Data model (3) | ● ● ● ○ — enquiry + quote objects missing, consent too coarse |
| Main experience (4–5) | ● ● ● ● — Today + 360 strong; Suggest feed to formalise |
| Leads & enquiries (6) | ● ○ ○ ○ — the big gap |
| Pipeline (7) | ● ● ● ○ — stages live; no quotes, no forecasting |
| Communication hub (8) | ● ● ○ ○ — email-style inbox + AI drafts; channels later |
| Automation (9–10) | ● ● ● ○ — journeys live; sequences/NL-builder later |
| Service (11) | ○ ○ ○ ○ — deliberately growth-phase |
| Marketing integration (15) | ● ○ ○ ○ — segments exist; no handoff loop |
| LUNA modes (16) | ● ● ● ○ — Ask + Do strong; Suggest partial |
| Guardrails (17) | ● ● ● ● — house pattern from day one |
| Reporting (18) | ● ● ● ○ — 9 reports + NL; trends later |
| Compliance & security (19) | ● ● ○ ○ — single-tenant honesty; consent v2 + encryption next |
| Mobile (24) | ● ● ● ○ — responsive; native affordances later |
| Onboarding (25) | ● ● ○ ○ — tour + guide; import missing |
| Differentiators (26) | 2 strong, 6 partial, 4 not started |

The blueprint confirms the direction and the architecture. The next sessions should go through the
front door: **enquiries first, then quotes.**
