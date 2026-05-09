# Day 2A — Seed data & Customers list

**Date:** 9 May 2026
**Status:** Complete
**Goal:** 30 realistic customers seeded into Supabase, working customer list with smart segmentation.

---

## What we built

### Seed data (`lib/seed/data.ts`)

A single TypeScript module defining 30 households, their contacts, trips, interactions, and preferences. Names mirror the mockup so the demo feels continuous between mock and live data. Bournemouth-area cities, UK phone numbers, realistic email patterns.

**Date anchoring:** trips use `depart_offset_days` relative to "now" rather than fixed dates. Sarah Thompson is always "departing in 3 days" whenever you seed, the Maldives anniversary is always coming up. Means the demo stays coherent if we re-seed weeks from now.

**Counts:**
- 30 households
- ~62 contacts (lead, partner, children, dependants)
- ~50 trips across all six lifecycle stages
- ~12 interactions (the highest-priority ones — Sarah's transfer worry, Olivia's honeymoon enquiry, Margaret's Madeira chat, etc.)
- ~6 preferences for the Thompson exemplar
- 9 suppliers (preferred + avoid flags)

### Two seed paths (`/api/seed` and `supabase/seed.sql`)

Both populate the same data. Single source of truth — the SQL is generated from the TypeScript via `scripts/generate-seed-sql.ts`.

**API endpoint** is the primary path. Visit `/api/seed` once, the empty-state page on `/customers` makes this a one-click button. Idempotent — refuses to seed if any households already exist.

**SQL fallback** is the backup. If the API call fails for any reason (network, RLS edge case, deploy hiccup), Andy can paste `supabase/seed.sql` into the Supabase SQL Editor and get the same result.

### Smart segmentation (`lib/segmentation/parse.ts` + `query.ts`)

The natural-language parser ports cleanly from the mockup. Same logic, but now it's a typed module returning a structured `Token[]` shape:

```ts
type Token = {
  type: "destination" | "time" | "household" | "value" | "status" | "location";
  label: string;          // for the chip UI
  icon: string;           // which icon to render
  filter: TokenFilter;    // discriminated union the server uses to query
};
```

The server-side query module translates tokens into Supabase filter calls. Some filter on `households` directly (LTV, household_type, city). Others need to look at related tables — for those we fetch related ids first, then intersect against the household query.

Day 5 swaps the parser for a Claude API call returning the same `Token[]` shape. The UI doesn't change. The filter logic doesn't change. Only the parser swaps.

### Customers page (`app/customers/page.tsx` + `customers-view.tsx` + `seed-prompt.tsx`)

URL-driven state — `?q=greece%20families` or `?seg=greece-quiet` — so queries become shareable links.

Server Component reads URL params, parses tokens or resolves saved segment, queries Supabase, computes live counts for each saved segment chip, hands off to a Client Component for the interactive UI.

Client Component handles:
- Free-text input → submit to URL
- Token chip × buttons (drop a token, refine the query)
- Saved segment chips with live counts and active state
- Local text search on top of the server-filtered list
- Bulk row selection with action bar (Email selected · Add tag · Draft outreach)
- Empty state when no rows match

### What the user sees

1. **Empty database** → Seed Database card with one button. Click → "Inserting…" spinner → "Seeded successfully" confirmation → page refreshes with 30 households.
2. **Type "greece"** in the smart input → press Enter → URL updates → tokens appear → table re-renders with filtered results.
3. **Click "Past Greece bookers, no contact 12+ mo"** saved segment → tokens populate, table filters, segment chip shows active state.
4. **Click any row** → toggles selection. Bulk action bar appears at the top. Combined LTV calculated live.

---

## Decisions made today

**1. URL-driven state.** Queries are first-class and shareable. The price: every change is a server round-trip. Worth it for 30 customers; we'll optimise with client-side caching if it gets sluggish.

**2. Same seed data, two output formats.** TypeScript module is the source of truth; the SQL is generated from it. Means the SQL never drifts from what the API endpoint produces.

**3. Permissive `Database = any` type.** The `@supabase/ssr` type generics fight you on every insert if you hand-maintain the Database type. For MVP the row types are explicit (Household, Contact, Trip, Interaction) but Database itself is `any`. Phase 2 swaps for the auto-generated types from `supabase gen types`.

**4. Token removal is fuzzy for free-text queries.** When you click × on a chip, the query re-emits the remaining tokens' labels and re-parses. Imperfect but pragmatic. Day 5 fixes this — Claude returns first-class tokens that we can drop individually without round-tripping through the parser.

**5. Avatar colours derived deterministically from display name.** Same household always gets the same colour. No need for a stored avatar field.

**6. Trip click-through deferred to 2B.** Clicking a row currently just toggles selection. The customer detail page lands in 2B with the AI brief surface, predictions, and household graph.

---

## What's next (day 2B)

1. **Customer detail page** — `/customers/[id]/page.tsx` with the AI brief surface (Sarah Thompson's pre-cached brief shown verbatim, real Claude wires day 5)
2. **Delta strip** — "what changed since you last looked"
3. **Predictions panel** — three cards (opportunity, trip match, risk)
4. **Household graph** — visual tree of contacts in the household
5. **Smarter trip cards** with "Travelling now" live status
6. **Listening footer** — what Luna's been doing in the background

---

## Open questions

None blocking. The fifth killer feature decision (voice / crisis console / MCP) is still open but doesn't block 2B.

---

## How to deploy

See `DEPLOY-2A.md` for the full step-by-step. Summary:

1. Drop the new files into the repo via GitHub Desktop → publish to GitHub
2. Vercel auto-deploys on push (90 seconds)
3. Visit `/customers` on your live URL
4. See the "Seed database" card → click the button → wait 5 seconds → 30 households appear
5. Type queries in the smart input bar, click saved segments, try the bulk select
