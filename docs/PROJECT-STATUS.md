# Project status & route to completion

**Last updated:** 23 June 2026
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
- [ ] **Command palette (⌘K)** — make the stubbed "Quick find" real: fuzzy search over customers, trips, nav, and Ask Luna. Self-contained.
- [ ] **Test suite** — Vitest over the pure logic: journeys matcher + dedupe, segmentation `tokenFromFilter`, scoring, trip helpers, plus API validation rejects.
- [ ] **Calendly booking** — per-agency link in Settings, "Book a call" on the customer/inbox. Needs a Calendly link/token.
- [x] **Responsive layouts** — done. Added a responsive CSS layer to `globals.css` (the app styles inline, which can't hold media queries, so layout-critical rules now live as classes). Sidebar becomes an off-canvas drawer below 900px with a hamburger in the topbar and a dimming overlay (via a small `SidebarContext` + `AppShell`). All multi-column grids (dashboard, journeys, settings, reports, customer detail) collapse through 1024/768/640 breakpoints; the inbox goes three-pane → two-pane → stacked; customers table scrolls horizontally. Breakpoints: 1024 / 900 / 768 / 720 / 640.
- [ ] **Observability** — error logging on the API routes, surface the audit trail. Needs a Sentry DSN if used.

### Still genuinely future (not blocking)
Auth + RLS for multi-tenant, generated Supabase types, a scheduled trigger for journeys (cron) instead of manual "Run now", and swapping the in-memory rate limiter for Upstash.
</content>
</invoke>
