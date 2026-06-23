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
- [ ] **1. Dashboard** (`app/page.tsx`) — replace the day-1 placeholder with a real home: morning briefing, KPIs (customers, live pipeline, departures, needs-attention), pipeline-by-stage, departures board, needs-attention list, recent activity. All data already queryable.
- [ ] **2. Settings** (`app/settings/page.tsx`) — replace the "coming soon" stub: workspace branding, AI tone of voice, team list, journey-rules surface (feeds Phase B), compliance note.

### Phase B — The missing pillar
- [ ] **3. Journeys / auto-pilot (Day 6)** — schema tables (`journeys`, `journey_runs`) exist but there is no UI or trigger logic. Build journey list + rule builder (trigger -> action template), a run/evaluate endpoint that logs `journey_runs`, and surface "what Luna did in the background" on the Dashboard.

### Phase C — Deepen the AI
- [ ] **4. Inbox drafts -> Claude** — currently a hand-crafted library in `inbox-view.tsx`. Wire to real Claude using the brief route's security pattern; keep the library as fallback.
- [ ] **5. Segmentation -> Claude (optional)** — `parseQueryToTokens` is a local regex. Swap to a Claude call returning the same `Token[]` shape, regex as fallback. Works well as-is for the demo.

### Phase D — Production-ready
- [ ] **6. Rate-limit the AI routes** — `/api/ask`, `/api/customers/[id]/brief` have no rate limit (flagged as a TODO in the code). Add Upstash before any client-facing use.
- [ ] **7. Commit a lockfile** — repo has no `package-lock.json`, so Vercel resolves deps fresh each deploy. Commit one for reproducible builds.
- [ ] **8. Backfill build-log docs** for days 4 to 7.

**Demo-complete target:** Phase A + B. **Production-grade:** + Phase C/D.
</content>
</invoke>
