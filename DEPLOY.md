# Day 1 deployment — step by step

Total time: about 15 minutes. Zero Terminal needed.

You'll be doing four things:
1. Push these files to GitHub
2. Run the schema in Supabase
3. Connect Vercel and add three environment variables
4. Watch your live URL come up

---

## Step 1 — Push to GitHub

1. Go to https://github.com/new
2. Repository name: **`Travelgenix-CRM`**
3. Set it to **Private**
4. Click **Create repository**
5. On the next page, click **uploading an existing file**
6. **Open this folder on your Mac in Finder.** Select all of these (⌘A) and drag them into the GitHub upload area:
   - `.env.example`
   - `.gitignore`
   - `README.md`
   - `package.json`
   - `tsconfig.json`
   - `next.config.mjs`
   - `tailwind.config.ts`
   - `postcss.config.mjs`
   - `app/` (the whole folder)
   - `components/` (the whole folder)
   - `lib/` (the whole folder)
   - `public/` (the whole folder, even if empty)
   - `supabase/` (the whole folder)
   - `docs/` (the whole folder)

   GitHub will preserve folder structure on drag-and-drop.

7. Scroll down. Commit message: **`Day 1: Foundation — schema and shell`**
8. Click **Commit changes**

You now have a private repo with everything in it.

---

## Step 2 — Run the schema in Supabase

1. Go to https://supabase.com → your project
2. In the left sidebar, click **SQL Editor**
3. Click the green **New query** button at the top
4. **Open `supabase/migrations/20260509120000_initial_schema.sql` from this folder** (any text editor — TextEdit on Mac is fine)
5. Select all (⌘A), copy (⌘C)
6. Click into the empty Supabase editor and paste (⌘V)
7. Click the green **Run** button at the bottom right (or press ⌘↵)
8. Wait 2–3 seconds. You'll see **"Success. No rows returned."**
9. Click **Table Editor** in the left sidebar — you should see all 14 tables listed: agencies, contacts, households, interactions, journeys, journey_runs, notes, preferences, suppliers, tasks, trip_components, trip_passengers, trips, users

✅ Schema is live.

---

## Step 3 — Connect Vercel

1. Go to https://vercel.com/new
2. Click **Import Git Repository**
3. Find **Travelgenix-CRM** in the list, click **Import**
4. On the configuration screen, find the **Environment Variables** section
5. Add these three (copy values from your Supabase project's **Settings → API** page):

| Name | Value |
|------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://your-project-id.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | (the long anon key — starts with `eyJ`) |
| `NEXT_PUBLIC_AGENCY_ID` | `00000000-0000-0000-0000-000000000001` |

6. Click **Deploy**
7. Wait 60–90 seconds. You'll see a confetti animation when it's live.
8. Click **Continue to Dashboard**
9. Click the URL Vercel gives you (something like `travelgenix-crm.vercel.app`)

---

## Step 4 — Verify everything works

On your live URL:

1. **Dashboard** loads — you see the navy "Travelgenix CRM is live" panel with the day 1 status
2. **Click Customers in the sidebar** — you should see a green banner at the top: **"Supabase connected. 0 households in the database."** This proves the database is wired up correctly.
3. **Click each other nav item** — Inbox, Trips, Reports, Settings — each loads its placeholder page
4. **Click the moon/sun icon** in the bottom-left of the sidebar — the whole app switches to dark mode and back

---

## Troubleshooting

**"Supabase not reachable" red banner on Customers page**

- Check the env vars in Vercel are set correctly. They are case-sensitive.
- Confirm the schema migration ran. Go to Supabase Table Editor and check `households` exists.
- Re-deploy from Vercel if you changed env vars (Settings → Deployments → ⋯ → Redeploy).

**Build failure on Vercel**

- Should not happen — we tested the build before zipping. If it does, check the build log for the specific error.

**Theme toggle doesn't work**

- Clear browser cache. The theme is stored in localStorage.

---

## What you have now

- A live URL serving Luna Work's day 1 foundation
- A real Supabase database with 14 tables ready to receive data
- A design system that matches the mockup (light + dark)
- All six routes loading
- A build log you can reference

## What's next

Day 2: seed realistic demo data, build the customer list with smart segmentation, ship the customer detail page.

When you're ready for day 2, just say the word.
