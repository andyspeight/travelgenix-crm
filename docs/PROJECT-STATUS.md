# Project status & route to completion

**Last updated:** 23 July 2026
**Stack:** Next.js 14 (App Router) · Supabase · Anthropic Claude · Tailwind + CSS tokens · Vercel

This is the living source of truth for where the build is and what is left. The
per-day build logs in `docs/build-log/` cover days 1 to 3; days 4 and 5 shipped
in code ahead of their write-ups (tracked below).

---

## Done

| Area | What shipped | Notes |
|------|--------------|-------|
| **Day 1 — Foundation** | 14-table schema, app shell (sidebar, topbar, theme), Supabase clients, 6 routes | `docs/build-log/day-1-foundation.md` |
| **Day 2A — Customers list** | Seed data (30 households), smart segmentation, bulk actions | `docs/build-log/day-2a-customers.md` |
| **Day 2B — Customer 360** | Detail page: AI brief, predictions, household graph, timeline, listening footer | `docs/build-log/day-2b-customer-detail.md` |
| **Day 3 — Inbox** | Three-pane triage, lanes, ranked drafts, mini customer card | `docs/build-log/day-3-inbox.md` |
| **Day 4 — Trips Kanban** | Drag-and-drop board, optimistic stage change with rollback, accessible select fallback, `/api/trips/[id]/stage` | build-log doc still to write |
| **Day 5 — AI engine (partial)** | Real Claude, server-side, security-hardened: customer **brief** (Sonnet) + **trip match** (Haiku) + **Ask Luna** tool-use router (6 query tools + insight synthesis) | build-log doc still to write |
| **Reports** | Revenue / source / destination / new-customer reports, client-computed, no chart lib | part of day 7 scope |

Build is green: `tsc --noEmit` clean, `next build` passes all 9 routes + 6 API routes.

---

## To do — route to completion

Ordered by demo impact. Checkboxes track live state.

### Phase A — Close the visible holes
- [x] **1. Dashboard** (`app/page.tsx`) — done: morning briefing, KPIs (customers + LTV, live pipeline, departures, needs-attention), pipeline-by-stage bars, departures & travelling list, needs-attention list, recent activity, empty-state.
- [x] **2. Settings** (`app/settings/page.tsx`) — done: workspace identity, real team list, Luna AI house style + models + feature status, integration connection states, live compliance roll-ups (GDPR / marketing / passports). Read-only where persistence is not wired yet, honestly labelled.

### Phase B — The missing pillar
- [x] **3. Journeys / auto-pilot (Day 6)** — done. `lib/journeys/engine.ts` (pure matcher + starter journeys + templated actions), `/journeys` page with install/run/pause, API routes (`install`, `run`, `[id]` toggle), runs logged to `journey_runs`, tasks/drafts written, sidebar entry, and an auto-pilot strip on the Dashboard. Run is deterministic (no API key needed). Triggers wired: days-to-departure, days-after-return, passport-expiring, no-contact-period. See `docs/build-log/day-6-journeys.md`.

### Phase C — Deepen the AI
- [x] **4. Inbox drafts -> Claude** — done. `POST /api/inbox/[id]/drafts` generates ranked, fact-grounded drafts via Sonnet (brief-route security pattern). The hand-crafted library stays as the instant default; the "Draft with Luna" / "Regenerate" button swaps in live drafts with a "Live" badge. Fails closed to the library if the key is unset or the call fails.
- [x] **5. Segmentation -> Claude** — done. `lib/segmentation/resolve.ts` translates a query to the same `Token[]` via Haiku, with `parseQueryToTokens` as the fallback. Chip labels/icons are synthesised from validated filters, so the UI is identical and an invalid filter is dropped.

### Phase D — Production-ready
- [x] **6. Rate-limit the AI routes** — done (best-effort). `lib/ai/rate-limit.ts` is a per-instance fixed-window limiter applied to the ask, brief and drafts routes (429 + retry-after). Honest caveat: per-instance on serverless; swap the Map for Upstash for a hard distributed limit before client-facing use.
- [x] **7. Commit a lockfile** — done. `package-lock.json` committed for reproducible builds.
- [x] **8. Backfill build-log docs** — done. Days 4, 5, 6 and 7 written.

**Demo-complete target:** Phase A + B. **Production-grade:** + Phase C/D.

---

## Status: original 7-day plan complete

Every phase above is done. The app builds green (`tsc --noEmit` clean, `next build`).

---

## Phase 2 — integrations & polish (in progress)

Track 3 of the post-completion roadmap. Ordered by value per unit of friction.

- [x] **Tasks screen (`/tasks`)** — works the queue journeys write to. Server page buckets open tasks by due date (overdue/today/week/later/undated), filters for snoozed/done/all, complete + snooze (3-day bump) + reopen via `PATCH /api/tasks/[id]`. Sidebar entry, and open-task counts folded into the Dashboard briefing and KPI.
- [x] **Command palette** — done. Quick-find palette over navigation, customers and trips with full keyboard control (up/down/enter/esc). Opens from the sidebar "Quick find" button and **⌘P** (⌘K stays with Luna Ask, per decision). Backed by `GET /api/search`; navigation filtered client-side.
- [x] **Test suite** — Vitest over the pure logic: journeys matcher, segmentation parser, scoring (risk + opportunity) and customer next-steps. 46 tests, `npm test`. Fixtures in `lib/test/`.
- [x] **Wire all customer/segment actions for real** — removed every placeholder control. Customer 360: "Add note" (writes a timeline interaction), "Draft a reply" (deep-links the inbox to the latest message), "Schedule call" (creates a follow-up task; opens `NEXT_PUBLIC_CALENDLY_URL` if set), and a data-driven "Luna · Next steps" panel whose "Do" buttons create tasks / open the reply. Customers list: "Email all" / "Email selected" / "Draft outreach" (open a pre-addressed mail draft), "Add to journey" (enrolls via `POST /api/journeys/enroll`), "Add tag" (`POST /api/customers/tag`), and "Save segment" (`POST /api/segments`, persisted). Deleted the unused `ComingSoon` component.
  - **Deploy note:** "Save segment" needs the new `segments` table — run `supabase/migrations/20260628120000_segments.sql` in Supabase. Until then the rest works and the save action returns a clear "run the migration" message.
- [ ] **Calendly booking** — per-agency link in Settings, "Book a call" on the customer/inbox. Needs a Calendly link/token.
- [x] **Responsive layouts** — done. Added a responsive CSS layer to `globals.css` (the app styles inline, which can't hold media queries, so layout-critical rules now live as classes). Sidebar becomes an off-canvas drawer below 900px with a hamburger in the topbar and a dimming overlay (via a small `SidebarContext` + `AppShell`). All multi-column grids (dashboard, journeys, settings, reports, customer detail) collapse through 1024/768/640 breakpoints; the inbox goes three-pane → two-pane → stacked; customers table scrolls horizontally. Breakpoints: 1024 / 900 / 768 / 720 / 640.
- [x] **Product tour** — in-app step-by-step onboarding overlay (`components/tour/*`) covering set-up and every screen, deep-linking to each, auto-opening once on first visit and re-openable from the sidebar "Take a tour".
- [x] **PDF user guide** — branded full user guide at `docs/Luna-Work-User-Guide.pdf` (source `docs/user-guide.html`, render to PDF with headless Chromium `--print-to-pdf`). Covers every feature with how-to steps and tips. Hand to new sign-ups to cut training.
- [x] **Gap-review fix batch** — from the pre-launch gap sweep:
  - Inbox **Send as is / Edit before sending** wired for real (pre-addressed mailto with the draft; inline edit then send; disabled with a reason when no email on file).
  - **Household rollups** (`lifetime_value`, `trips_count`, `next_departure`) recomputed on every trip stage change (`lib/customer/rollups.ts`); moving into `booked` stamps `last_booking_at`. Unit-tested.
  - **Add customer** flow: modal on /customers → `POST /api/customers` creates household + lead contact, opens the record.
  - **Live inbox badge**: `GET /api/inbox/badge`, sidebar fetches per navigation, hidden at zero (hardcoded "3" removed).
  - **Journey run review**: `PATCH /api/journeys/runs/[id]` (sent/skipped, agency-scoped via the parent journey); the journeys feed lets you review a queued draft, open it pre-addressed in email, mark done or skip — queued runs no longer pile up forever.
  - Hardening: `AbortSignal.timeout` on every Anthropic fetch; household notes heads-up panel on the Customer 360; `/api/seed` now POST-first (GET kept for the documented browser fallback, idempotent); GitHub Actions CI (test + build); stale comment fixed.
- [x] **Ask Luna coverage** — 9 tools: added `customer_profile` ("tell me about X"), `business_report` ("build me a report for <period>") and `customers_gone_quiet` (the guide-promised question). Unit-tested against a fake Supabase builder.
- [x] **Ask Luna act layer + follow-ups** — actionable answers now carry an action bar (Email all / Add to journey / Add tag, reusing the segment-bar endpoints; `GET /api/journeys/list` powers the picker). Follow-up questions work: the panel keeps the thread (last 4 turns, capped server-side) so "and just the VIPs?" resolves in context; "New question" resets. Guide §11 updated.
- [x] **CSV import (Luna-mapped)** — `/customers/import`: drop any CRM/spreadsheet export; Luna maps the columns from headers + sample values (`POST /api/import/map`, Haiku, whitelist-validated, deterministic synonym-matcher fallback so import works without AI). Review step has per-column override dropdowns and a live preview with row-level issues; import (`POST /api/import/customers`) re-validates server-side, bulk-inserts household + lead contact, and dedupes by name/lead email so re-running a file never duplicates. Pure library in `lib/import/` (RFC4180 CSV parser, mapping schema, name split/compose, UK-first date + money + type normalisation) with 15 tests incl. an end-to-end Capsule-export smoke test.
- [ ] **Observability** — error logging on the API routes, surface the audit trail. Needs a Sentry DSN if used.

---

## Phase 3 — blueprint gap closure (in progress)

Working through `docs/blueprint-gap-review.md` in its recommended order.

- [x] **1. Enquiries — the front door** (this session). The structured enquiry object + AI extraction + first-response clock + the first events on the shared-data-loop spine:
  - **Schema**: `supabase/migrations/20260723090000_enquiries_events.sql` — `enquiries` (structured request fields, verbatim `original_wording`, `ai_summary`, four-score `scores` jsonb, response-clock columns) and the generic `events` table (`type`, `source`, `subject_type/id`, `payload`) that Travelify and Luna Marketing will plug into.
  - **Qualification**: `lib/enquiries/scoring.ts` — four SEPARATE deterministic scores (likelihood / value / urgency / relationship fit), each with a plain-English reason, null-with-honesty when data is missing. Blueprint rule: no single mysterious score. Unit-tested.
  - **Clock**: `lib/enquiries/clock.ts` — 4-hour first-response target, ok → warning (final quarter) → overdue states. Unit-tested.
  - **Events**: `lib/events/emit.ts` — best-effort emitter; `enquiry.created / responded / converted / closed` all fire.
  - **API**: `POST /api/enquiries` (validated create, server-side scores, repeat-customer recognition by email match, timeline interaction), `POST /api/enquiries/extract` (Haiku reads pasted email/form/call notes into fields — REVIEW-BEFORE-SAVE, writes nothing, brief-route security pattern), `PATCH /api/enquiries/[id]` (respond / convert-to-trip incl. household+contact creation with rollback / close with lost reason).
  - **UI**: `/enquiries` screen — clock-pressure-sorted "Needs response" tab, score pills with reasons on hover, respond (mailto + clock stop), convert, close-with-reason; "New enquiry" modal with paste-with-Luna extraction and blank-form paths. Sidebar + command palette + tour entries. Dashboard: "Awaiting first response" panel and briefing sentence lead with the response clock.
  - **Seed**: 4 demo enquiries (overdue / warning / fresh / responded, one linked to the Thompsons by email).
  - **Deploy note:** run `supabase/migrations/20260723090000_enquiries_events.sql` in Supabase. Until then /enquiries shows a run-the-migration notice and everything else keeps working.
- [x] **2. Quotes + Quote Rescue** (this session). The sales story of every priced proposal, and the blueprint's differentiator 3:
  - **Schema**: `supabase/migrations/20260723150000_quotes.sql` — versions (a revision is a new row, the old one 'superseded', so price changes stay countable), sent/expiry/viewed/view_count, deposit + expected margin, the customer's actual response, declined reason. `reference` points at Travelify's quote — pricing truth stays there.
  - **Rescue detector**: `lib/quotes/rescue.ts` — deterministic at-risk signals (engaged-no-response ⇒ call; expiring/expired ⇒ extend-or-close; never-viewed ⇒ check it landed; gone-quiet ⇒ nudge; departure-approaching amplifies). Severity 1–3, every alert explains itself. 11 unit tests.
  - **API**: `POST /api/quotes` (create/revise, send flips an enquiry-stage trip to quoted), `PATCH /api/quotes/[id]` (send / record_view / respond / accept — books the trip at the quoted price + refreshes rollups + stamps last_booking_at / decline with reason / extend). Events: `quote.sent/viewed/accepted/declined/revised`.
  - **UI**: `/quotes` screen — Luna's rescue strip on top (worst first, named intervention), status tabs, full lifecycle actions, "New quote" modal against any enquiry/quoted trip. Dashboard: Quote rescue panel in the left column, briefing sentence counts quotes at risk. Sidebar + palette + tour entries.
  - **Ask Luna**: 10th tool `quotes_at_risk` — same detector, so the spoken answer and the UI can never disagree.
  - **Deploy note:** run `supabase/migrations/20260723150000_quotes.sql` in Supabase. Until then /quotes shows a run-the-migration notice.
- [x] **3. Consent v2** (this session) — consent is no longer one tick box:
  - **Schema**: `supabase/migrations/20260723180000_consents.sql` — APPEND-ONLY ledger (a change is a new row; the audit trail is the table). Channels: email / SMS / WhatsApp / phone / post / profiling, each row carrying source, exact wording, evidence pointer and date. Backfill seeds one email grant per contact whose legacy `marketing_opt_in` was true; unknown stays unknown (not refusal — and not permission either).
  - **State lib**: `lib/consent/state.ts` — latest-row-wins reduction, three states (granted / refused / unknown), `canMarket()` gate. 6 tests.
  - **API**: `POST /api/contacts/[id]/consent` records a change, syncs the legacy email flag, emits `consent.updated` on the event spine, writes a timeline interaction.
  - **Enforcement**: `/api/customers/emails` now takes `purpose` (default `marketing`) — bulk outreach only includes contacts with a current email grant, and reports `excluded_no_consent` so the segment bar and Ask Luna act layer say "N excluded, no marketing consent" instead of silently shrinking. `operational` purpose skips the gate (PECR distinguishes; so do we). Falls back to the legacy flag if the migration isn't run.
  - **UI**: per-channel consent panel on the Customer 360 (adults only — we don't market to children), chips with granted ✓ / refused ✕ / not-recorded states, inline recorder capturing source + wording.
- [x] **4. Event spine emitters everywhere** (this session) — the CRM side of the shared data loop is complete. New events: `trip.stage_changed` (with from → to), the blueprint-named `booking.created` and `trip.completed` at their moments, `task.completed`, `customer.created`, `journey.executed` (per journey that fired, with counts) — joining the enquiry.*, quote.* and consent.updated emitters. All best-effort; a spine write never fails a user action.
- [x] **5. Luna Suggest feed** (this session) — the proactive "I noticed…" layer. `lib/suggest/detectors.ts` (9 tests): **rebooking window** (their own cadence says they're due, nothing planned — differentiator 4), **gone quiet** (£4k+ lifetime, 14+ months silent, no pipeline; never doubles up with the rebooking window), **passport risk** (the computed 360 risk, surfaced without opening the record), **unreachable** (contacts with no email or phone — escalates when travel is live). "Luna · I noticed" panel on the Dashboard, severity-ordered, each with the reason and a named action, capped at 5 with an honest overflow count. Enquiry clocks and quote rescue keep their dedicated panels; together the four panels are the blueprint's Today screen.
- [x] **6. Travel Memory + rebooking window** (this session / step 5) — the blueprint's signature feature. `lib/memory/travel-memory.ts` (8 tests): deterministic assembly of how the customer travels — places (with repeat counts), typical spend, booking rhythm and favoured months, trip length, who travels (children's ages from DOBs), occasions, recorded vs Luna-inferred preferences (provenance + confidence shown), dietary/flags, the latest quote-decline reason. EVERY line carries its citation; nothing computable honestly = nothing shown. Rendered as the "Travel memory" panel in the 360's main column, grouped (Where they go / How they book / What they spend / Who travels / What they like / Worth knowing). The rebooking window half shipped with step 5's Suggest feed.
- [x] **7. CSV import + AI mapping** — recovered from the stranded `claude/project-status-plan-gokkji` branch (built 2 Jul, never merged) and landed on main 23 Jul. See the Phase 2 entry above for detail. Post-import health check still to come (fold into the data-quality assistant / Suggest feed).

---

## Phase 4 — growth pillars (in progress)

Andy's chosen order: 1) service cases, 2) NL journey builder, 3) hardening.

- [x] **1. Service cases with travel-aware priority** (blueprint §11, differentiator 5):
  - **Schema**: `supabase/migrations/20260724090000_cases.sql` — case type (13 travel types), subject/detail, status lifecycle (open → in progress / waiting → resolved with the outcome recorded), computed `priority` + `priority_reason`, `sla_due_at`.
  - **Priority engine**: `lib/cases/priority.ts` (8 tests) — deterministic and explained: travelling-now forces P1; departure ≤7 days forces at least P2; children in the party, vulnerable-traveller flags and £8k+ bookings each bump a notch; every priority carries an SLA target (P1 2h / P2 8h / P3 24h / P4 72h).
  - **API**: `POST /api/cases` (priority + SLA computed server-side from the real trip/traveller context, `case.opened` event, timeline entry), `PATCH /api/cases/[id]` (start / wait / resolve-with-outcome / reopen; `case.resolved` carries resolution minutes + within-SLA).
  - **UI**: `/service` queue — priority-then-SLA ordered, P-badge shows its computed reason on hover, SLA countdown reuses the enquiries clock, new-case modal reports back the computed priority. Sidebar (LifeBuoy icon) + palette + tour; the morning briefing now leads with urgent open cases.
- [x] **2. Natural-language journey builder** (blueprint §9) — "the user writes it, LUNA builds it, explains it, and the administrator tests it before activation":
  - **Engine**: new dispatchable custom rule `quote_unanswered` (quotes join `EvalContext`; the blueprint's own £5k-quote example now runs), quote-chase email template, `describeTrigger` coverage. New rule kinds need no database change.
  - **Validator**: `lib/journeys/compose.ts` — the model proposes, the whitelist disposes. Five composable triggers with per-parameter clamps, three actions, mandatory name + explanation. 8 tests incl. an end-to-end run of a validated spec through the real engine.
  - **Compose route**: `POST /api/journeys/compose` — Sonnet translates the sentence into the engine's vocabulary (instructed to put anything unsupported into `caveats`, never invent), validation, then a live DRY RUN ("would fire for N customers today, e.g. …"). Writes nothing.
  - **Activate route**: `POST /api/journeys/create` — re-validates the round-tripped spec from scratch, inserts the journey; it then behaves exactly like any hand-built rule (run endpoint + journeys page both feed quotes to the matcher now).
  - **UI**: composer card on /journeys — sentence in, review card out (explanation, When/Then labels, dry-run count with examples, amber "Left out:" caveats), Activate / Discard.
- [x] **3. Production hardening, round 1** — the pre-tenant essentials:
  - **Rate limiting v2**: `enforceRateLimit()` — a hard distributed window in Upstash Redis (REST pipeline INCR+PEXPIRE+PTTL, no SDK) when `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN` are set; the per-instance window otherwise; an Upstash outage falls back to the local window rather than opening the tap. All SEVEN AI spend surfaces metered — the audit found the customers-page segmentation resolve was reachable from a bare `?q=` URL with no meter; over-limit it now degrades to the deterministic parser instead of spending. 8 tests.
  - **Access gate**: set `LUNA_ACCESS_CODE` in Vercel and the whole app (pages AND API) requires it — edge middleware checks an HMAC-signed, expiring httpOnly cookie (`lib/auth/gate.ts`, Web Crypto, 6 tests); /login is a minimal branded screen; the code check is constant-time-ish and rate-limited 5/min. Env var unset = gate open, so nothing locks out dev or a fresh deploy. **ACTION FOR ANDY: add LUNA_ACCESS_CODE in Vercel project settings to switch the lock on** (and optionally the two Upstash vars for the distributed limiter).
  - **Security headers**: X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy on every response. CSP deferred to the auth milestone (inline styles need nonce plumbing).
  - **Still the real multi-tenant milestone** (unchanged): Supabase Auth + RLS policies + per-user agency scoping, passport field encryption, journeys cron.

---

## Phase 5 — agreed remaining order (one at a time, fully tested, plain-English report between each)

Order agreed 24 Jul: 1) trends + forecasting, 2) real email sending, 3) multi-tenant platform milestone.

- [x] **1. Trend detection + forecasting** (blueprint §7 forecasting + gap-review item 9):
  - **Trends**: `lib/trends/detect.ts` (7 tests) — deterministic period-over-period deltas (60-day windows): enquiry volume, rising/falling destinations, first-response speed, conversion of resolved enquiries, cancellations, average booking value. A minimum-sample honesty guard means Luna says nothing rather than calling 3-vs-1 a "200% surge"; every headline carries both numbers. Bad news sorts first.
  - **Forecast**: `lib/forecast/forecast.ts` (6 tests) — the blueprint's two views. Booking-date view: open pipeline weighted by stage (enquiry 20% / quoted 45% / quoted-and-viewed 60% — a viewed live quote upgrades the weight, engagement is information), weights printed next to the numbers. Departure-date view: committed revenue (booked/pre-departure/travelling) vs weighted potential by departure month, six months out. Margin deliberately absent until commission capture lands.
  - **UI**: two "Luna" panels at the top of /reports (server-rendered, no new queries beyond enquiries + live quotes): "What's changing" with tone-coloured ▲/▼ receipts, and "Forecast" with the weighted pipeline lines and a committed/potential bar per departure month. Hidden entirely when the data can't honestly support them.
- [x] **2. Real email sending** — the first live channel, purpose-routed across two providers per Andy's call: **SendGrid for transactional** (one-to-one replies, booking messages), **Brevo for marketing** (shared with Luna Marketing):
  - **Policy**: `lib/email/policy.ts` (6 tests) — ONE gate for every outbound email. No address → no send; suppressed address (hard bounce / spam complaint) → no send for ANY purpose, with the reason shown; marketing purpose needs a positive consent grant (refused and never-recorded both block — PECR-safe); operational sends (replies, booking admin) skip the consent gate as the law intends. Every refusal is a plain-English sentence the agent sees.
  - **Providers**: `lib/email/providers.ts` — purpose-routed dispatch, plain REST (no SDKs), 10s timeout, fails closed. Operational → SendGrid, marketing → Brevo; when only one key is configured it carries both purposes rather than refusing. No keys → every send button falls back to the old mailto behaviour. Nothing breaks, nothing pretends to send. Optional separate marketing sender via `EMAIL_FROM_MARKETING`.
  - **API**: `POST /api/email/send` — rate-limited 30/min, resolves the recipient (contact or raw address), reads current consent from the ledger (legacy-flag fallback), checks suppressions, then policy-gates, dispatches via the purpose's provider, and records: an `email_sends` audit row with the provider that carried it (kept even for failures), an `email_out` interaction on the customer timeline, `email.sent` on the event spine. `POST /api/email/webhook` (secret-token auth, let through the access gate) takes BOTH providers' bounce/complaint events — Brevo's single-object shape and SendGrid's event arrays — → suppression row + audit row flip + `email.bounced`.
    - **SHARED SENDGRID ACCOUNT** (flagged by Andy 29 Jul): the account serves the whole Travelgenix estate, so this endpoint receives events for every tool that sends, not just the CRM. `lib/email/webhook-events.ts` (10 tests) makes that cheap and quiet: normalise → **one** indexed lookup for all message ids in the batch → act only on the sends we recorded. A batch containing nothing of ours costs a single query, no writes and no per-event logging. Each event suppresses for **the agency that actually sent it**, resolved from the send row, so a shared account can never cross agencies. Deliberately conservative: we do NOT suppress an address because it bounced from Luna Marketing or the widget suite — we could not know which agency it belonged to, and suppressing on an ambiguous signal would silently stop one agency's mail because of another product's bounce.
  - **Schema**: `supabase/migrations/20260729090000_email_channel.sql` (+ `20260729100000` provider column) — `email_sends` (full audit: to/subject/body/purpose/context/status/provider/provider id) + `email_suppressions` (unique per agency+address with reason). Both applied live.
  - **UI**: when configured — Inbox "Send as is / Send edited" genuinely sends and confirms "Sent to … and recorded on the timeline"; Enquiries "Respond now" opens an inline composer, the clock stops only after a real send; a journey draft's button becomes "Send now" (Luna drafted, a human dispatched). Settings shows SendGrid and Brevo rows so it's obvious which mode the workspace is in. Bulk segment email stays mailto for now — deliberate; bulk through Brevo needs sequences + per-send caps (next round).
  - **Sending identity is PER AGENCY** (added 29 Jul after Andy asked the right question: "aren't the from address and name going to be the client's details?" — they are, and a platform-wide `EMAIL_FROM` would have put Travelgenix's name on every agency's mail):
    - **Schema**: `agencies.email_from_address` / `email_from_name` / `email_reply_to` / `email_sender_verified` (applied live).
    - **`lib/email/sender.ts` (8 tests)**: the constraint is deliverability, not preference. An agency's own domain can only appear in From once it is SPF/DKIM-authenticated with the provider; before that it reads as spoofing and lands in spam. So two honest states — **verified**: From is genuinely theirs, nothing of ours appears; **not yet**: From is the platform's authenticated address carrying the AGENCY'S NAME, with Reply-To pointing at the agency, so the traveller sees the agency in their inbox and replies reach them. The display name is never blank and never ours.
    - Both providers send the resolved sender + Reply-To. `EMAIL_FROM` is demoted to the platform's fallback envelope, never the displayed identity.
    - Settings shows "What your customers see" — the exact From line, where replies go, and whether the agency's own domain is authenticated yet.
  - **A bounce now CORRECTS THE RECORD** (added 31 Jul after Andy asked "should I be seeing anything?" — he should have been, and wasn't). The first live bounce suppressed the address correctly, but the enquiry still read "responded" and the timeline still showed an email the customer never received. The customer was waiting while the screen said the job was done — precisely the quiet wrongness this build avoids everywhere else.
    - **Schema**: `email_sends.interaction_id` + `enquiry_id` (applied live) so a send can be traced back to what it was answering.
    - **Webhook**: on a bounce it now also marks the timeline entry *"Bounced — not delivered"* (or *"Reported as spam"*), and **reopens the enquiry** — status back to `new`, clock running again, because a reply that bounced is not a reply.
    - **Luna Suggest**: new `undeliverable` detector at severity 3, the top of the feed: *"The Whitfields never received your email — dead@example.com bounced… they are still waiting for a reply."* A spam complaint reads differently from a dead address. 4 tests.
    - Coverage is split by where the agent would actually look: an un-converted enquiry reappears in **Needs response**; a linked customer surfaces on the **dashboard**.
    - Backfilled the one bounce that predated the fix.
  - **ACTION FOR ANDY**: in Vercel add `SENDGRID_API_KEY` (transactional) and/or `BREVO_API_KEY` (marketing), plus `EMAIL_FROM` — the **platform's** authenticated address (e.g. `mail@travelgenix.io`), not a client's — and optional `EMAIL_FROM_NAME` / `EMAIL_FROM_MARKETING`. Each agency's own from-name/address goes on their `agencies` row. For bounce handling: add `EMAIL_WEBHOOK_SECRET` and point each provider's event webhook at `https://<app>/api/email/webhook?token=<secret>`.
- [ ] **3. Multi-tenant platform milestone** — REDESIGNED 29 Jul after reading Control (the suite's shared identity system, in the tg-widgets repo). Luna Work does NOT build its own Supabase Auth: it reads the same `tg_session` sign-in every Luna tool reads. Control already registers this app as product slug `crm` → `travelgenix-crm.vercel.app`. Confirmed with Andy: Luna Work moves to **crm.travelify.io**, and `crm` is the CLIENT CRM (Travelgenix's own internal B2B CRM is the separate `luna_desk` slug at tg-crm-b2b.vercel.app), so `crm` must stop being staff-only in Control at go-live.
  - [x] **Stage A — identity in** (this session):
    - `lib/auth/control.ts` (8 tests): resolves the caller through Control's own `GET /api/auth/me`, forwarding their cookie server-to-server. Deliberately does NOT re-verify the JWT or read Control's Airtable — the signing secret and identity schema stay in one deployment, and revocation, suspension, multi-company switching, entitlements and staff act-as all behave here exactly as elsewhere because it is the same code answering. `X-TG-Act-As` is forwarded untouched (Control decides; we never interpret it). Fails closed on every doubt. 30s cache keyed on the exact credentials presented.
    - `lib/auth/session.ts`: one `getSession()` for the whole app. Control mode resolves the caller → their Control client → the mapped Luna Work agency; an unmapped or unentitled session gets NOTHING (never a default tenant — "couldn't work out who you are" must never mean "here is someone else's data"). Single-tenant mode is unchanged, so today's deployment behaves exactly as before.
    - **Schema**: `20260729140000_control_client_mapping.sql` — `agencies.control_client_id` + partial unique index (applied live).
    - **Middleware**: when `CONTROL_BASE_URL` is set, the front door becomes Control — no cookie redirects to Control's sign-in with a `next` back here (API calls get 401). Cookie presence only; real authorisation is server-side per request. The `LUNA_ACCESS_CODE` gate remains as the interim fallback when Control isn't configured.
    - **Settings**: a Sign-in section showing the mode, who you are, which client you're working in, your role, and whether this workspace is linked to a Control client.
  - [x] **Stage B1 — the tenant becomes a property of the request** (this session): all 238 `AGENCY_ID` call sites across 46 files now read the session instead of a module constant. Pages call `requireAgencyId()` (redirects to a new `/no-access` page that explains itself, rather than rendering an empty screen); API routes call `apiAgencyId()` and **403 before touching the database** when it's null. `AGENCY_ID` survives as the single-tenant fallback with exactly one caller (`lib/auth/session`) and a comment saying so, so it can't quietly creep back. Two deliberate exceptions: the preferences helpers now take the agency as a parameter instead of closing over a constant, and the **email webhook resolves the agency from the send it's about** (a provider has no session — an event we can't tie to one of our sends is skipped, never guessed, because suppressing an address for the wrong agency would silently stop their mail). Behaviour-preserving in single-tenant mode.
  - [x] **Stage B2 — enforcement built, NOT yet switched on** (this session). ⚠️ **Live security finding**: all 22 tables have RLS disabled while `NEXT_PUBLIC_SUPABASE_ANON_KEY` ships to the browser — anyone with that key can read or write every row directly against the Supabase API, bypassing the app. True today, single-tenant, not only a multi-tenant concern.
    - `lib/supabase/tenant-token.ts` (6 tests): mints a 60-second Supabase-shaped JWT per request carrying the caller's `agency_id`, signed with the project JWT secret. PostgREST exposes it as `auth.jwt()`, so policies reduce to "rows matching the token" and a query that forgets its own filter returns nothing instead of another agency's customers.
    - `lib/supabase/server.ts`: the token is attached by wrapping the client's `fetch`, so no call site changed. Plus `createSystemClient()` (service-role) for the only two reads that legitimately span tenants — resolving which agency a Control client maps to (the lookup that *answers* "who is this request", so it can't ask it first without looping) and the provider bounce webhook. `getSession()` is React-`cache`d so one request resolves once.
    - **Migration written but deliberately NOT applied**: `20260729160000_rls_tenant_isolation.sql` — `current_agency_id()` reading the claim, `tenant_isolation` policies (USING + WITH CHECK, so a row can't be inserted into or moved to another agency) on all 18 agency-scoped tables, parent-scoped policies for `trip_passengers` / `trip_components` / `journey_runs`, and self-only on `agencies`.
    - **Inert until configured**: with `SUPABASE_JWT_SECRET` unset nothing is attached and behaviour is exactly as today. Settings shows "Database enforcement: on/off" so the posture is visible rather than assumed.
    - **REVISED 29 Jul after checking the project's keys**: this Supabase project has moved to **asymmetric JWT signing keys** (current key ECC P-256; the HS256 shared secret survives only as the previous key, kept to verify unexpired tokens). Supabase does not expose the private half of an asymmetric key, so the app cannot mint its own tenant tokens, and building on the legacy secret would break the CRM the day it is revoked — and would hold a sensible key rotation hostage. So:
      - **Nothing in this app talks to Supabase from the browser** — `lib/supabase/client.ts` existed but was imported by nothing; client components import types only. It has been deleted. Every query is server-side.
      - The server now uses the **service-role key**, and the RLS policies deny the published anon key everything. That closes the actual hole: the key in the page source stops being a way in.
      - Service role bypasses RLS, so the "forgotten filter" guarantee moves to **`lib/supabase/tenant-filters.test.ts`** — a static check that reads the source and fails the build if a query on a tenant table is left unnarrowed. It found 34 candidates on first run; after being sharpened to the real bug class (a query with NO narrowing at all, since id-narrowed follow-ups and inserts are safe) it is green, and it self-tests that it can still detect a regression.
      - The check also caught a latent bug: **`preferences` has no `agency_id` column** (it is scoped through its household), so the migration as originally written would have errored on apply. Fixed to a parent-scoped policy.
    - **✅ SWITCHED ON AND VERIFIED, 29 Jul.** `SUPABASE_SERVICE_ROLE_KEY` set in Vercel and deployed, then the migration applied. Verified in the database by assuming each role:
      - **Before**: as `anon` — 30 households, 79 contacts, 53 trips readable. The hole was real.
      - **After**: as `anon` — 0 rows on every table (households, contacts, trips, quotes, consents, preferences, agencies), and an INSERT is refused with *"new row violates row-level security policy"*.
      - **After**: as `service_role` (what the app uses) — full data intact: 30 / 79 / 53 / 8 / 1.
      - **Live app**: /customers renders real households and lifetime values, no empty state; no runtime errors in the hour after.
      Settings now reports the honest **Database access** mode rather than a boolean that described the abandoned design.
  - [x] **Stage B3 — the schedule and the sensitive field** (31 Jul):
    - **Journeys cron** — until now Luna's journeys only ran when somebody pressed "Run now", so an agency that forgot got no passport reminders, no rebooking nudges, no post-trip follow-ups. An automation that needs a human to remember it is not automation. `lib/journeys/run.ts` now holds the run logic ONCE, used by both the button and the schedule so they cannot drift; `GET /api/cron/journeys` authenticates with `CRON_SECRET` (a scheduler cannot hold a cookie), loops every agency on the system client with per-agency error isolation so one bad workspace cannot stop the rest, and `vercel.json` runs it daily at 06:00 UTC. Safe to run daily: the existing `journey_runs` dedupe means a candidate that has already fired never fires again, so a nightly schedule does not nag a customer nightly. **Nothing is sent** — tasks and notes are written, emails are drafted for review.
    - **Field encryption** — `lib/crypto/field.ts` (13 tests): AES-256-GCM, authenticated so tampering is detected, versioned `v1:iv:tag:ciphertext` so a future scheme needs no guesswork, fresh IV per encryption so identical numbers do not look identical, never double-encrypts, reads pre-key plaintext unchanged, and returns null rather than throwing on a wrong key — an unreadable passport shows as absent instead of taking down the customer page. Plus `maskPassport()` for display.
    - **Scope, honestly**: `passport_number` is the target — the most abusable field an agency holds, and one nothing computes on. **It is currently empty and unreferenced anywhere in the app**, so this is groundwork: correct from the first row ever captured, protecting nothing today. `passport_expiry` is deliberately NOT encrypted — it drives the risk score, the compliance roll-ups, the Suggest feed and the `passport_expiring` trigger, all of which compare across every contact. Encrypting everything until the product stops working is theatre with casualties.
    - The forgotten-filter check caught the new cron route's estate-wide `agencies` query on its first run — added as an explicit, reasoned exception rather than a quiet edit.
  - [x] **Observability** (31 Jul) — deliberately NOT a log viewer; Vercel already covers crashes and error rates. This covers what fails QUIETLY, where nothing errors and nobody finds out:
    - **The heartbeat**: `cron_runs` records every scheduled run (status, agencies, actions, per-agency detail), including runs that could not proceed. A stopped schedule is the worst failure in this product — journeys just stop firing, no page breaks, customers stop being reminded — and the ABSENCE of a recent row is the signal.
    - **`lib/health/checks.ts` (14 tests)**: schedule staleness (>26h a missed run, >48h genuinely not running, and "switched off" distinguished from "broken"), send failures and bounces judged **as a rate not a bare count** (3 failures in 200 is noise; 3 in 4 is broken configuration), suppression count, and honest "off" states for AI and sign-in. Each check says what it looked at and what to do.
    - **Settings → System health**: a traffic light plus a line per check, computed from real activity rather than a status page that always says green.
    - **`GET /api/health`**: liveness for an uptime monitor, reachable without a session — so deliberately minimal. App up + database reachable, 503 when not. No counts, names, config or versions: that would be a map of the estate for anyone who finds the URL, and it is already on Settings for a signed-in admin.
  - [ ] **Still to come**: wiring encryption into a passport-capture UI when one exists.
  - **ACTION FOR ANDY (optional, both)**: set `CRON_SECRET` in Vercel to switch the nightly run on (Vercel generates and sends it automatically once crons are enabled); set `LUNA_FIELD_KEY` to 64 hex chars (`openssl rand -hex 32`) before any passport number is ever captured.
  - **ACTION FOR ANDY**: point `crm.travelify.io` at the Vercel project; set `CONTROL_BASE_URL` (e.g. `https://widgets.travelify.io`); in Control, set the `crm` product's Launch URL to the new domain, flip it off staff-only when ready for clients, and map each agency by putting its Control client record id on the `agencies.control_client_id` column here.

### Still genuinely future (not blocking)
Auth + RLS for multi-tenant, generated Supabase types, a scheduled trigger for journeys (cron) instead of manual "Run now", and swapping the in-memory rate limiter for Upstash.
</content>
</invoke>


---

## Phase 6 — the Attio review, revisited (in progress)

Andy shared attio.com as the fastest-growing CRM in the general B2B space and
asked what we could learn. Most of their playbook we were already running —
AI in the data model rather than a bolted-on chatbot, a conversational layer,
and reporting that is a documented weakness of theirs and a strength of ours.
Three places they were genuinely ahead:

1. **Sequences** — multi-step, stop-on-reply. ← DONE
2. **Enrichment on create** — theirs is company/LinkedIn data; the travel
   version is school-holiday flags, visa and passport-validity rules, flight
   times, seasonality.
3. **Reply and engagement tracking** — inbound email onto the timeline, opens
   and replies, not just sends.

- [x] **1. Sequences** (31 Jul) — a chase that runs over days and stops the moment it should.
  - **Schema**: `sequences` / `sequence_steps` / `sequence_enrolments` (applied live, RLS policies included from the start). `delay_days` is measured from ENROLMENT, not from the previous step, so editing one step cannot silently shift everything after it. A unique index means nobody is ever chased twice down the same track for the same thing.
  - **`lib/sequences/engine.ts` (14 tests)** — the decision, and the care is all in stopping. Every stop condition is checked BEFORE considering a send, on every evaluation, not only when a step is due: a reply on day 2 must stop the chase before day 3 comes round. Stop reasons, in priority order: an agent pressed stop, they replied, the thing resolved (quote accepted/declined/answered), the address is undeliverable, marketing consent withdrawn. Consent is consulted for MARKETING sequences only — chasing a live quote is service under PECR, and stopping it on a marketing withdrawal would abandon someone mid-booking. Plus: never two steps in one day even if a run was missed, so catching up cannot arrive as a burst.
  - **`lib/email/send.ts`** — the send pipeline lifted out of its HTTP route so an unattended sequence send passes exactly the same consent check, suppression check and per-agency sender identity as a human-pressed one. The route is now a thin wrapper; there is one pipeline, not two.
  - **`lib/sequences/runner.ts`** — enrols via the existing journeys matcher (one trigger vocabulary, not two), then evaluates every active enrolment. A provider refusal stops the whole chase and records the provider's own words, rather than retrying nightly.
  - **Safety**: `auto_send` is per sequence and defaults FALSE. In review mode each step becomes a task in the queue agents already work, with the wording ready. The starter installs PAUSED and in review mode — nobody should discover their CRM chasing customers with words they have never read.
  - **UI**: `/sequences` — the steps as chips, live counts, and a "Stopped — and why" list, which is the bit that tells an agent the automation is behaving itself. Sidebar, palette and tour entries.
  - **Cron**: sequences run in the same nightly pass as journeys.
- [ ] **2. Enrichment on enquiry** — the travel-native answer to Attio's auto-enrichment.
- [ ] **3. Reply and engagement tracking** — inbound onto the timeline; opens and replies.
