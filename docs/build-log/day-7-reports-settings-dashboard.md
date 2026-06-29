# Day 7 — Reports, Settings, Dashboard + completion pass

**Status:** Complete
**Goal:** Fill the last placeholder surfaces and finish the route to completion tracked in `docs/PROJECT-STATUS.md`.

---

## Reports (`/reports`)

Server Component fetches all trips once; the client view owns a date-range toggle (this year / last 12 months / all time) and computes four reports client-side, so flipping range is instant with no refetch. Charts are lightweight CSS/SVG using the design tokens, no charting library. All figures are gross booking value; there is deliberately no margin report because commission is not in the data yet, and an honest revenue view beats a column of zeros.

## Dashboard (`/`)

Replaced the day-1 placeholder with a real home. One parallel fetch of households, trips and inbound interactions, all computed in memory:

- A morning-briefing banner whose sentence is built from live data.
- Four KPIs: customers + lifetime value, live pipeline + booked ahead, departures in 7 days + travelling now, needs-you-today + inbox size.
- Pipeline-by-stage bars, a departures and travelling list, a needs-attention list into the inbox, and a recent-activity timeline.
- A "Luna on auto-pilot" strip showing recent journey runs (see day 6).
- Empty state pointing at the seed flow.

## Settings (`/settings`)

Real, data-driven workspace page: agency identity, the team from the `users` table, Luna's enforced house style and per-feature status, integration connection states (Anthropic reflects whether the key is set), and live compliance roll-ups (GDPR consent, marketing opt-in, passport expiry) computed from contacts. Controls without a persistence layer are read-only and labelled rather than faked.

## Completion pass (Phases C and D in PROJECT-STATUS)

- **Inbox drafts to Claude** — `POST /api/inbox/[id]/drafts` produces ranked, fact-grounded drafts; the curated library stays the instant default and the "Draft with Luna" button swaps in live drafts.
- **Segmentation to Claude** — `lib/segmentation/resolve.ts` translates a query to the same `Token[]` via Haiku, with the rules-based parser as fallback. Chip labels are synthesised from validated filters so the UI is identical either way.
- **Rate limiting** — `lib/ai/rate-limit.ts`, a best-effort per-instance limiter applied to the ask, brief and drafts routes. Honest caveat documented: swap the Map for Upstash for a hard distributed limit.
- **Reproducible builds** — committed a `package-lock.json`.
- **Docs** — backfilled build logs for days 4, 5 and 7, refreshed the README status table.

---

## Decisions

1. **Honest over flashy.** Settings shows read-only managed values instead of Save buttons that do nothing. Reports omits margin rather than invent it.
2. **AI deepens behind a fallback.** Drafts and segmentation gain a live Claude path but never lose the deterministic one, so the demo is robust with or without an API key.
