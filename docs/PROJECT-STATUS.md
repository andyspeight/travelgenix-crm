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
- [ ] **3. Consent v2** — per-channel consent records with evidence (PECR; prerequisite for the Luna Marketing audience handoff).
- [ ] **4. Event spine emitters everywhere** — stage changes, journey runs, tasks; the Travelify/Luna Marketing socket already has its table.
- [ ] **5. Luna Suggest feed** — deterministic detectors + narration on the Dashboard.
- [ ] **6. Travel Memory panel + rebooking window** on the 360.
- [x] **7. CSV import + AI mapping** — recovered from the stranded `claude/project-status-plan-gokkji` branch (built 2 Jul, never merged) and landed on main 23 Jul. See the Phase 2 entry above for detail. Post-import health check still to come (fold into the data-quality assistant / Suggest feed).

### Still genuinely future (not blocking)
Auth + RLS for multi-tenant, generated Supabase types, a scheduled trigger for journeys (cron) instead of manual "Run now", and swapping the in-memory rate limiter for Upstash.
</content>
</invoke>
