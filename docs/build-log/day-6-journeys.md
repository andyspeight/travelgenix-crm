# Day 6 — Journeys (auto-pilot)

**Date:** 23 June 2026
**Status:** Complete
**Goal:** Turn the dormant `journeys` / `journey_runs` schema into a working auto-pilot: rules that watch customers and do the follow-ups nobody has time for.

---

## What we built

### The engine (`lib/journeys/engine.ts`)

A pure, side-effect-free core so the page preview and the run endpoint share one source of truth.

- **Types** for `Journey`, `JourneyRun`, and the matcher's `Candidate`.
- **Four starter journeys** (`DEFAULT_JOURNEYS`), each mapping onto data we actually hold:
  - Pre-departure check-in — 10 days before departure, create a task
  - Welcome home — 3 days after return, draft an email
  - Passport expiry warning — passport within 180 days of expiry, create a task
  - Re-engage quiet customers — no contact for 12 months, draft an email
- **`evaluateJourney(journey, ctx)`** — the matcher. Given current households, trips, contacts and a last-contact map, returns who is eligible right now and why. Deterministic, so it needs no model and can run on every page load to preview "X eligible now".
- **`buildAction(...)`** — what Luna produces when a candidate fires. Tasks and templated email drafts in the Travelgenix house style (UK English, no em dashes, no filler). The same Claude pattern the brief route uses can replace these templates later without touching anything else.

Triggers wired: `days_to_departure`, `days_after_return`, `passport_expiring`, `no_contact_period`. `birthday` / `anniversary` / `custom` are recognised but match nothing until their data sources land.

### API routes

- **`POST /api/journeys/install`** — installs the four starters. Idempotent: does nothing if any journey already exists.
- **`POST /api/journeys/run`** — body `{ journeyId? }`. Evaluates one or all active journeys, dedupes each candidate against prior `journey_runs` (so pressing Run twice never doubles up), performs the action (insert a task, queue a draft, add a note), logs a `journey_run`, and stamps `last_run_at`. No model call, so it cannot fail on a missing API key.
- **`PATCH /api/journeys/[id]`** — pause or activate a journey. Whitelists `is_active` only, agency-scoped, same shape as the trip-stage route.

### The page (`/journeys` + `journeys-view.tsx`)

Server Component computes per-journey eligibility and the recent run feed, hands off to a client view that owns install / run / pause. Each mutation posts then `router.refresh()`s so eligibility and the feed recompute server-side — no optimistic guessing, because these actions write real rows.

- Navy summary bar with active count, total eligible, and "Run all active".
- A card per journey: trigger + action pills, pause/activate, eligible-now count, last run, "Run now".
- "What Luna has done" activity feed, with drafts clearly marked *awaiting review*.
- Empty state that installs the starters in one click.

### Surfaced on the Dashboard

A compact "Luna on auto-pilot" strip on `/` shows the latest runs, only when there are any, linking through to the journeys page. Closes the loop: the dashboard now shows work Luna did without being asked.

### Sidebar

Added a **Journeys** nav item (new `ZapIcon`) between Trips and Reports.

---

## Decisions made today

**1. Drafts are queued, never auto-sent.** A `draft_email` action produces a draft held on the `journey_run` with status `queued`, surfaced as "awaiting review". The product promise is Luna does the work and the human approves, so nothing leaves the building on its own.

**2. Matching is deterministic, drafting is templated for now.** Eligibility never needs a model, so it is free and instant. Draft bodies are templates today; swapping them for Claude is the same server-side, fact-grounded pattern as the brief route and is tracked in PROJECT-STATUS.

**3. Dedupe on (journey, household, trip).** Before firing, a candidate is checked against existing runs. Run is safe to press repeatedly and a customer never gets the same task twice.

**4. Starter journeys are installed, not seeded.** Keeps `/api/seed` unchanged and lets a workspace opt in from the page. Install is idempotent.

---

## What's next

Phase C: wire the inbox drafts (and optionally segmentation) to Claude, then Phase D hardening (rate-limit the AI routes, commit a lockfile). See `docs/PROJECT-STATUS.md`.
