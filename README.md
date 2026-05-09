# Luna Work — Travelgenix CRM

The travel-native CRM, built on Supabase, Next.js, and Claude.

> _"HubSpot for travel agencies, with AI doing the work nobody has time for."_

---

## Status

| Day | Build | Status |
|-----|-------|--------|
| 1 | Foundation — schema + shell | ✅ |
| 2 | Customers list + smart segmentation | Next |
| 3 | Inbox — triage + ranked drafts | |
| 4 | Trips — Kanban + predictions | |
| 5 | AI engine — brief + segmentation backend | |
| 6 | Auto-pilot journeys + dashboard polish | |
| 7 | Demo polish + reports + settings | |

---

## Stack

- **Next.js 14** App Router with TypeScript
- **Supabase** for database, real-time, storage (auth wires in phase 2)
- **Tailwind CSS** plus CSS custom properties for design tokens
- **Anthropic Claude** for the AI engine (day 5)
- **Vercel** for deployment, AWS migration in phase 2

---

## Quick start (deployment)

This repo is designed to be deployed without a local dev environment. If you want to run it on your machine, see "Local development" below — but you don't need to.

### 1. Push to GitHub

The `Travelgenix-CRM` repo on GitHub. After uploading the contents of this folder:

```
.gitignore
.env.example
README.md
package.json
tsconfig.json
next.config.mjs
tailwind.config.ts
postcss.config.mjs
app/
components/
lib/
public/
supabase/
docs/
```

### 2. Run the schema in Supabase

Open your Supabase project → SQL Editor → New query → paste the contents of `supabase/migrations/20260509120000_initial_schema.sql` → Run.

You'll see "Success. No rows returned." Click Table Editor in the sidebar — 14 tables exist.

### 3. Connect Vercel

- Vercel → New Project → Import the `Travelgenix-CRM` repo
- Add three environment variables:
  - `NEXT_PUBLIC_SUPABASE_URL` — from Supabase Settings → API
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY` — from Supabase Settings → API
  - `NEXT_PUBLIC_AGENCY_ID` — `00000000-0000-0000-0000-000000000001` (the bootstrap agency)
- Deploy

You'll have a live URL within 90 seconds. The Customers page will show a green "Supabase connected · 0 households" banner.

---

## Project structure

```
travelgenix-crm/
├── app/                    # Next.js App Router
│   ├── layout.tsx          # Root shell (sidebar + main)
│   ├── page.tsx            # Dashboard
│   ├── globals.css         # Design tokens
│   ├── inbox/page.tsx
│   ├── customers/page.tsx
│   ├── trips/page.tsx
│   ├── reports/page.tsx
│   └── settings/page.tsx
├── components/
│   ├── layout/
│   │   ├── sidebar.tsx
│   │   ├── topbar.tsx
│   │   └── theme-provider.tsx
│   └── ui/
│       ├── icons.tsx
│       └── coming-soon.tsx
├── lib/
│   └── supabase/
│       ├── client.ts       # Browser client
│       ├── server.ts       # Server Components client
│       └── types.ts        # Database types (hand-maintained for MVP)
├── supabase/
│   └── migrations/         # Pasted into Supabase SQL Editor for now
├── docs/
│   └── build-log/          # Day-by-day decision trail
├── public/
└── README.md
```

---

## Design tokens

All in `app/globals.css` as CSS custom properties:

- **Brand** — `--tg-primary` (navy), `--tg-accent` (teal)
- **Semantic** — `--success`, `--warning`, `--error`, `--info`
- **Surfaces** — `--bg`, `--bg-subtle`, `--surface`, `--border`, `--hover`
- **Text** — `--text`, `--text-muted`, `--text-subtle`
- **Layout** — `--sidebar-w`, `--topbar-h`

Dark mode toggles via `[data-theme="dark"]` on `<html>` (set by the ThemeProvider).

---

## Local development

If you want to run it on your machine:

```bash
npm install
cp .env.example .env.local
# fill in your Supabase URL and anon key
npm run dev
```

Open http://localhost:3000.

---

## Build log

Day-by-day decisions are captured in `docs/build-log/`. Read these in order to understand why the codebase looks the way it does.

- [Day 1 — Foundation](./docs/build-log/day-1-foundation.md)
