# Day 2A — Deployment

Total time: about 5 minutes. You've already done this drill once with day 1, so this should feel familiar.

What's in this drop:
- The seed data module (`lib/seed/data.ts`)
- The /api/seed endpoint (`app/api/seed/route.ts`)
- The SQL fallback (`supabase/seed.sql`)
- The smart segmentation parser and query module (`lib/segmentation/`)
- An updated Customers page with the empty-state seed prompt
- Updated icons module (extra icons used by the segmentation UI)
- Updated Supabase types (relaxed `Database` for cleaner inserts)
- Day 2A build log

---

## Step 1 — Push the new files via GitHub Desktop

1. **Unzip** `travelgenix-crm-day-2a.zip` somewhere on your Mac
2. Open **GitHub Desktop**
3. Make sure your `travelgenix-crm` repo is the active one
4. Open Finder, navigate **into** the unzipped `travelgenix-crm/` folder
5. **Select all** the contents (⌘A) — you'll see the same folders and files as last time, plus a new `scripts/` folder
6. **Drag everything** into your local repo folder via Finder (the local clone GitHub Desktop made — find it via GitHub Desktop's "Repository → Show in Finder")
7. macOS will ask **"replace existing files?"** — click **Replace** for all
8. Back in GitHub Desktop, you'll see a list of changed and new files in the left panel

**Sanity check** — what should be changed/added:

**New files:**
- `app/api/seed/route.ts`
- `app/customers/customers-view.tsx`
- `app/customers/seed-prompt.tsx`
- `lib/seed/data.ts`
- `lib/segmentation/parse.ts`
- `lib/segmentation/query.ts`
- `scripts/generate-seed-sql.ts`
- `supabase/seed.sql`
- `docs/build-log/day-2a-customers.md`
- `DEPLOY-2A.md` (this file)

**Modified files:**
- `app/customers/page.tsx`
- `components/ui/icons.tsx`
- `lib/supabase/types.ts`
- `package.json` (no functional changes — same dependencies)

9. **Commit message** at the bottom: `Day 2A: Seed data and Customers list with smart segmentation`
10. Click **Commit to main**
11. Click **Push origin** at the top

Vercel will auto-deploy. Wait 90 seconds.

---

## Step 2 — Verify the live deployment

1. Open your live URL (`travelgenix-crm.vercel.app` or your custom domain)
2. Click **Customers** in the sidebar
3. You should see a **"Seed the database"** card with a button

(If you see the green "Supabase connected" banner instead, that means you've already seeded — skip to Step 4.)

---

## Step 3 — Seed the database

**Path A (preferred): use the in-app button**

1. Click **Seed database** on the Customers page
2. You'll see "Inserting suppliers, households, contacts, trips, interactions…" with a spinner for about 5 seconds
3. Then "Seeded successfully" with the counts (9 suppliers, 30 households, 62 contacts, 50 trips, 12 interactions, 6 preferences)
4. The page refreshes after 1.5s and shows the customer list

**Path B (fallback): paste the SQL**

If for any reason the in-app button fails (rare — would only happen if the deployment is misconfigured):

1. Open `supabase/seed.sql` from the unzipped folder in any text editor
2. Select all (⌘A), copy (⌘C)
3. In Supabase: **SQL Editor → New query → paste → Run**
4. Should complete in 2–3 seconds
5. Refresh your live `/customers` page

---

## Step 4 — Try the smart segmentation

You should now see 30 households in a table. Test the new feature:

1. **Type a query** in the smart input bar at the top — try `greece` and press Enter. You'll see token chips appear and the table filter to matching households.

2. **Try a more complex one:** `families with kids in pre-departure`. The parser will pick out three tokens.

3. **Click a saved segment chip** — try "Travelling right now". You should see ~3-4 households (Sarah Thompson, Robert Hargreaves, The Davies, Geoffrey Holloway).

4. **Click rows to select them** — a bulk action bar slides in at the top with "Email selected · Add tag · Draft outreach".

5. **Click "Clear"** to reset back to all 30 customers.

6. **Look at the saved segment chip counts** — each chip shows the live count of matching households.

---

## What's next

Day 2B (next drop) builds the customer detail page — the AI brief surface, predictions, household graph, and listening footer. We'll preserve the Sarah Thompson exemplar from the mockup so the demo moment is intact.

---

## Troubleshooting

**Seed button gives "Database already has X households. Skipping seed."**

Means seeding worked previously. The button is idempotent and won't double-seed. To re-seed for testing, you'd manually clear the tables in Supabase first (Table Editor → households → delete rows). For now, you can ignore.

**The Customers page shows red "Supabase error"**

Same root cause as day 1 — env var typo, deployment cache. Solution is the same: check Vercel env vars are spelled correctly (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_AGENCY_ID`), then redeploy from Vercel's Deployments tab.

**Seed button shows red "Seed failed"**

The error message in red contains the step that failed and the Supabase error. Most common cause is a constraint mismatch between the schema migration and the seed data — if it happens, screenshot it and we debug.

**Tokens appear but table is empty**

The query might be too narrow. Try removing tokens by clicking the × on each chip, or click Clear. If "Travelling right now" shows 0 customers, the seed dates are off — check that depart_offset_days are being written as proper dates.
