# Day 2B — Deployment

Quick drop today — only 3 files changed/added. Total time: about 3 minutes.

---

## What's in this drop

**New files (2):**
- `app/customers/[id]/page.tsx` — the customer detail route
- `app/customers/[id]/detail-view.tsx` — the page composition with all sub-components

**Modified files (1):**
- `app/customers/customers-view.tsx` — row click now navigates to detail page

**Build log:**
- `docs/build-log/day-2b-customer-detail.md`

---

## Step 1 — Push the new files via GitHub Desktop

1. Unzip `travelgenix-crm-day-2b.zip`
2. Open GitHub Desktop, your `travelgenix-crm` repo should be active
3. Right-click the repo in GitHub Desktop → **Show in Finder**
4. Open Finder windows side by side: unzipped folder on left, your local repo folder on right
5. In the unzipped folder, select all (⌘A), copy (⌘C)
6. In your local repo folder, paste (⌘V)
7. macOS asks "replace existing files?" → tick **Apply to all** → click **Replace**

In GitHub Desktop you should now see **3 changed files** in the left panel:
- `app/customers/[id]/page.tsx` (new)
- `app/customers/[id]/detail-view.tsx` (new)
- `app/customers/customers-view.tsx` (modified)
- `docs/build-log/day-2b-customer-detail.md` (new)
- `DEPLOY-2B.md` (new)

(So actually 5 files total — the build log and this deploy guide too.)

8. Commit message: `Day 2B: Customer detail page with AI brief, predictions, household graph`
9. Click **Commit to main** → **Push origin**

Vercel auto-deploys, takes about 90 seconds.

---

## Step 2 — Try it

1. Open your live URL → click **Customers**
2. Click any row — for the full demo experience, **click "Sarah & James Thompson"** at the top of the list
3. You should see the full customer detail page with:
   - Delta strip at the top ("3 new things since you last looked")
   - Header card with avatar, name, contact info, tags
   - The full Luna AI brief (the one we seeded into the database)
   - Three prediction cards with confidence bars animating in
   - Timeline of interactions (Sarah's emails about transfers, anniversary)
   - Listening footer at the bottom
   - Right column: Next steps panel (navy), Trips, Household tree (Sarah, James, Oliver, Henry with the nut allergy ⚠), Preferences, Compliance

4. Try other customers too. They render the same page structure with placeholder text where Sarah has the demo content.

5. Try a row click on the **Patel Family** — they have an active enquiry showing in the trips panel. Or **Robert Hargreaves** — VIP, currently in the Maldives. Or **Margaret Doyle** — re-engagement target with the email you can see in their timeline.

6. Click **← All customers** in the topbar to go back to the list.

---

## What to look for

The critical demo moment is opening Sarah's record:

- **AI brief reads correctly** — full text about the Thompson family, their seven-year history, the Crete 2024 incident, the Maldives anniversary, Henry's nut allergy
- **Predictions animate in** — confidence bars grow from 0 to their values with a satisfying spring curve
- **Household graph shows the family** — Sarah (lead, teal border), James (partner), Oliver, Henry (with ⚠ allergy flag)
- **Timeline shows her interactions** — the transfer worry email at the top with the "today" priority badge
- **Trips panel** — Crete trip with green pulsing "Travelling now" badge, Maldives next, Banff in the past

If all of that looks right, day 2B has fully landed.

---

## Troubleshooting

**Click a row, see "404 Not Found"** — the dynamic route isn't resolving. Check that `app/customers/[id]/page.tsx` made it to the repo (the folder name `[id]` with brackets is important).

**Brief is missing on Sarah's record** — means the seed data didn't include the `ai_brief` field. Re-seed by manually clearing the `households` table in Supabase (Table Editor → households → select all → delete) then visiting `/api/seed` again.

**Predictions don't animate** — might be your browser. They use a CSS keyframe with a spring easing function. Cosmetic only.

**Household graph is empty** — means the contacts didn't seed. Check `contacts` table in Supabase has rows for that household.
