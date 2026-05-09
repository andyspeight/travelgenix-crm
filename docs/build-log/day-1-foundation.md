# Day 1 — Foundation

**Date:** 9 May 2026
**Status:** Complete
**Goal:** Schema deployed, Next.js shell live, Supabase connection proven.

---

## What we built

### Database (Supabase)

Created 14 core tables with proper foreign keys, indexes, enums, and updated_at triggers. The schema is in `supabase/migrations/20260509120000_initial_schema.sql` — pasted into the Supabase SQL Editor on 9 May 2026.

Tables, in dependency order:

1. **`agencies`** — single-tenant in MVP, but the column exists everywhere for phase 2 multi-tenant
2. **`users`** — agency team members; auth wires in phase 2, no auth for MVP
3. **`households`** — the unit of the customer relationship (Sarah & James Thompson)
4. **`contacts`** — individual people belonging to a household (Sarah, James, Oliver, Henry)
5. **`suppliers`** — Jet2, TUI, Hotelbeds, etc. with internal flags ('avoid', 'preferred')
6. **`trips`** — the lifecycle, with predictions stored as JSONB
7. **`trip_passengers`** — join table between trips and contacts
8. **`trip_components`** — flights, hotels, transfers, insurance, experiences
9. **`interactions`** — every email, chat, enquiry, call, note (the unified inbox feed)
10. **`tasks`** — follow-ups, reminders, journey-triggered actions
11. **`notes`** — free-form notes attached to households, contacts, or trips
12. **`preferences`** — first-class preferences (airline, room, dietary, budget, avoid)
13. **`journeys`** — auto-pilot rules (trigger + action template)
14. **`journey_runs`** — log of every triggered journey instance

Bootstrap data: one default agency (`Travelgenix CRM Demo`) and one default user (Andy) inserted.

### Next.js app shell

- **App Router (Next.js 14.2.15)** with TypeScript strict mode
- **Tailwind CSS** wired in alongside CSS custom properties (the property tokens come from the mockup, the Tailwind config gives us `bg-navy`, `text-teal-light` etc. when we want them)
- **Sidebar** — full nav, brand, quick-find button, theme toggle, user. Lifted from the mockup.
- **Topbar** — title plus actions, used on every page
- **Theme provider** — sets `data-theme="dark"` on `<html>`, persisted in localStorage. Toggle in the sidebar bottom-left.
- **Six routes** — Dashboard, Inbox, Customers, Trips, Reports, Settings. Every one renders without error.
- **Supabase clients** — `lib/supabase/client.ts` (browser) and `lib/supabase/server.ts` (Server Components). Day 1 already uses the server client on the Customers page to count households — proves the loop end-to-end.

### Live data check

The Customers page already queries Supabase. On render it counts households and shows a green status banner if connected, red if not. This is the simplest possible test that the whole stack works: env vars resolve, Supabase responds, the data layer is real.

---

## Decisions made today

**1. RLS off in MVP, on in phase 2.** Row-level security is critical when we go multi-tenant, but for the single-tenant demo it adds complexity without value. The schema is ready for it (every table has `agency_id`), we just don't enforce it yet.

**2. JSONB for evolving fields, columns for stable ones.** Trip components, AI predictions, journey configs, source metadata — all JSONB. Names, dates, foreign keys, monetary values — proper columns with proper types. This lets us iterate on the AI features without schema migrations every day.

**3. Denormalised counters on `households`.** `lifetime_value`, `trips_count`, `last_booking_at`, `next_departure` are stored on the household row even though they could be computed from related tables. Reason: the customer list and dashboard read these fields constantly, and JOINs at scale are expensive. We refresh them on trip mutations via app-level logic (or triggers later).

**4. Ai fields are first-class on the relevant tables.** `households.ai_brief`, `interactions.ai_priority`/`ai_reason`/`ai_drafts`, `trips.ai_predictions`. AI output is part of the data model, not a sidecar. This is the "context engineering" point from the strategy doc.

**5. Inline icons, not lucide-react.** Saves us a dependency on day 1. We can swap to lucide-react any time — the API surface is the same.

**6. Inline styles for the layout shell, Tailwind for utility.** The mockup used inline style objects extensively to keep the design tokens (CSS vars) flowing through cleanly. We mirror that approach in the React shell. As we build out feature-rich screens (Customers, Inbox), we'll lean more on Tailwind for utility — but the brand tokens stay in CSS variables.

**7. No auth for MVP, env-var-driven agency ID.** `NEXT_PUBLIC_AGENCY_ID` resolves to the bootstrap agency. Means we can ship the demo without a login screen.

**8. Supabase migrations folder set up for GitHub integration.** When we connect Supabase to the GitHub repo (post-MVP), this folder is the source of truth for schema. For day 1 we paste manually because it's faster.

---

## What's next (day 2)

1. **Seed realistic demo data** — 30 households, ~60 contacts, ~50 trips, 100+ interactions. Done via a TypeScript seed script we'll trigger from a `/api/seed` route, so we exercise the data layer.
2. **Customers list** — the smart segmentation screen from the mockup, real this time. Natural-language input, parsed-token chips, saved segments, bulk actions.
3. **Customer detail** — the AI brief surface, but with the data plumbing (the AI itself wires up day 5).

---

## Open questions

- Final answer on the fifth killer feature (A voice / B crisis console / C MCP) — needed by day 5
- Who specifically is the day 7 demo audience — needed by end of day 6
- Pricing posture for soft launch — not blocking the build but should be answered by day 7

---

## How to run / deploy

Locally (when you set it up later):

```
npm install
cp .env.example .env.local
# fill in NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY
npm run dev
```

For the demo, push to GitHub → Vercel auto-deploys. Two env vars needed in Vercel:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

`NEXT_PUBLIC_AGENCY_ID` defaults to the bootstrap UUID — only set it if you create a different agency.
