# Day 3 — Deployment

Quickest drop yet. Two files. Total time: 2 minutes.

---

## What's in this drop

**New files:**
- `app/inbox/inbox-view.tsx` — the three-column inbox UI
- `docs/build-log/day-3-inbox.md` — build log
- `DEPLOY-3.md` — this file

**Modified files:**
- `app/inbox/page.tsx` — replaces the day 1 placeholder

---

## Step 1 — GitHub Desktop drop

Same drill as before:

1. Unzip `travelgenix-crm-day-3.zip`
2. Open GitHub Desktop, your `travelgenix-crm` repo active
3. **Repository menu → Show in Finder** to open the local repo folder
4. In a second Finder window, open the unzipped `travelgenix-crm-day-3` folder
5. Show hidden files in both windows: ⌘ + Shift + .
6. In the unzipped window, ⌘A then ⌘C
7. In the local repo window, ⌘V — replace all when asked

In GitHub Desktop, Changes tab should show:
- `app/inbox/page.tsx` (modified)
- `app/inbox/inbox-view.tsx` (new)
- `docs/build-log/day-3-inbox.md` (new)
- `DEPLOY-3.md` (new)

8. Commit message: `Day 3: Inbox with triage, lanes, ranked drafts, mini customer card`
9. **Commit to main** → **Push origin**

Vercel auto-deploys, ~90 seconds.

---

## Step 2 — Try it

1. Open your live URL → click **Inbox** in the sidebar
2. You should see:
   - **Dark navy banner at the top** of the message list — "Luna · Triaged your inbox · Sorted 8 inbound messages…"
   - **Four lane tabs** — Today / This week / Later / All — with counts
   - **Today lane open by default** with three messages: Sarah Thompson, Margaret Collins, Olivia Carr
   - **First message auto-selected** (Sarah's transfer worry)
   - **Middle pane** showing Sarah's full email and three draft replies
   - **Right pane** showing Sarah's mini customer card

## The demo moment

**Click between the three drafts on Sarah's email.**

- "Reassuring · personal · references Crete" (92%) — the warm, full reply
- "Brief · operational" (78%) — the just-the-facts version
- "Warm · light · short" (71%) — the brief version with the rationale flagging it might feel dismissive

Each draft has a different "This one because:" rationale at the top explaining its trade-off. That's where Luna is doing real work — not just writing a reply, but giving Andy three deliberate choices and explaining what each one prioritizes.

Try other messages too:
- **Olivia Carr** (Tulum honeymoon) — two drafts, the engaged one with two specific properties named
- **Patel Family** (Sardinia tweak) — close-able quote, two drafts
- **Margaret Doyle** (re-engagement) — switch to the "Later" lane to find her — warm three-direction response

Click **Open full record →** at the bottom of the mini customer card to jump to that customer's detail page (day 2B). Close the loop.

---

## Troubleshooting

**Empty inbox** — the seed didn't include the interactions. Check Supabase → interactions table → should have ~12 rows. If 0, re-seed via `/api/seed`.

**Drafts don't switch on click** — should toggle instantly. If broken, check browser console for hydration errors.

**Right pane shows generic placeholder text** — means the household data didn't load. Check the URL has `?id=...` after clicking a message.
