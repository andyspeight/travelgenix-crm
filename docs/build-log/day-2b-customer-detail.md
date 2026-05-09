# Day 2B — Customer Detail page

**Date:** 9 May 2026
**Status:** Complete
**Goal:** Click a customer in the list, see the full Luna Customer 360.

---

## What we built

### Detail page route (`app/customers/[id]/page.tsx`)

Server Component. Reads the URL param, fetches the household, then loads contacts, trips, interactions, and preferences in parallel via `Promise.all`. Returns a 404 cleanly if the household isn't found. Hands everything to a single composition component for layout.

Why parallel fetches: a customer detail page touches five tables. Sequential queries would mean five round-trips. Parallel cuts it to one round-trip's worth of latency.

### Detail view (`app/customers/[id]/detail-view.tsx`)

The full page composition. Built as a single file with internal sub-components — easier to scan than splitting across many files at this stage. About 850 lines but reads naturally because each section is self-contained.

Sections, in order:

1. **Delta strip** — gradient teal panel, "what changed since last view". Sarah's pre-cached. Generic placeholder for everyone else until day 5.

2. **Header card** — avatar (deterministic colour from name), display name, email/phone/city, tag pills, four meta cells (type, customer since, lifetime value, trips booked).

3. **AI brief** — pulls from the `ai_brief` column. Sarah has the full version seeded. Others show a friendly stub explaining the demo. The "generated X ago" timestamp comes from `ai_brief_at`.

4. **Predictions row** — three cards: Opportunity (78% likely Q4 booking), Trip match (82% Amalfi fit), Risk (passports OK). Confidence bars animate in with a CSS keyframe spring curve. Hand-crafted text for Sarah, generic otherwise.

5. **Timeline** — interactions in reverse chronological order, max 20. Each row shows date, type label, subject, body summary, and the AI priority/reason if present. Coloured by interaction kind.

6. **Listening footer** — calm grey strip with pulsing teal dot. "Luna's been listening — re-checked passport validity, flagged the supplier history…"

7. **Right column:**
   - **Next steps panel** — dark navy, three numbered actions Luna recommends, each with a Do button. Hand-crafted for Sarah, generic otherwise.
   - **Trips panel** — active trip (with green "Travelling now" pulsing badge), upcoming, then most recent past trips. Each card shows flag emoji, destination, dates, occasion, stage pill, value, reference.
   - **Household graph** — only renders if there are contacts. Shows the family tree: lead and partner on top row, children and dependants on bottom row. Each node has avatar, first name, role label with age, and an allergy warning ⚠ if flagged.
   - **Preferences panel** — reads from the `preferences` table. Shows category labels and values. If no preferences, shows "Add when known" placeholders.
   - **Compliance panel** — derived from contact data. ATOL number static. GDPR consent, marketing opt-in, passport validity all computed from the contacts.

### Click-through from Customers list

Modified `customers-view.tsx`: clicking a row now navigates to `/customers/[id]`. The checkbox handles selection (still works for bulk actions). Two clear interaction modes — body of row = open detail, checkbox = select.

---

## Decisions made today

**1. Sarah is the exemplar; identify her by name.** Database UUIDs change per seed, so we use `display_name === "Sarah & James Thompson"` as the marker for "this is the demo customer with the full pre-cached experience." Every other customer renders the same page, just with placeholder text where the AI content would be. Clean fallback.

**2. AI brief lives in the database, not generated on demand.** Read directly from `households.ai_brief`. Means the demo always shows Sarah's full brief without waiting for an API call. Day 5 adds a "Refresh brief" action that triggers a real Claude generation.

**3. Predictions are hand-crafted in the UI for Sarah.** Not in the database. Reasoning: predictions need to be Claude-generated in real time anyway (day 5), and storing fake predictions in the DB would create migration pain when we swap to real ones. Better to keep them in the component for now.

**4. Timeline limit 20.** A customer can have hundreds of interactions over years. Cap at 20 most recent for the page render. Day 4-5 adds "Show all" with pagination.

**5. Compliance is derived, not stored.** GDPR / marketing / passports all computed from contact rows at render time. No separate compliance table needed for MVP.

**6. Layout is server-rendered.** Zero client interactivity on this page yet — it's all a Server Component. Means fast TTFB and smaller bundle. Day 3-4 add the interactive bits (reply drafting, action buttons that actually do things).

**7. Household graph age calculation runs at render time.** Means it always shows current ages without us needing to update the seed.

---

## What's next

Day 3: Inbox.

The customer detail page is now complete enough to demo. Feature work for it (real AI brief on demand, real predictions, edit functionality) lands on day 5+ when the AI engine wires in.

---

## Open questions

None. Day 3 starts when ready.

---

## How to deploy

See `DEPLOY-2B.md` for the step-by-step. Summary: drop new files via GitHub Desktop, push, Vercel auto-deploys, click a customer row on the live URL.
