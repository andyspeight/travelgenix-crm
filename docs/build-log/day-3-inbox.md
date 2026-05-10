# Day 3 — Inbox

**Date:** 9 May 2026
**Status:** Complete
**Goal:** Triage inbox with priority lanes, ranked drafts, mini customer card.

---

## What we built

### Inbox route (`app/inbox/page.tsx`)

Server Component. Three queries in parallel: all inbound interactions for the agency (limit 80, recent first), the households those interactions belong to, and the lead contacts for those households.

That's enough to render the full inbox — left pane (list), middle pane (focused message + drafts), right pane (mini customer card) — without any further data fetching client-side.

URL state drives selection: `?id=<interaction-id>` selects a message, `?lane=today|week|later|all` switches lane. Means selections are shareable links again.

### Inbox view (`app/inbox/inbox-view.tsx`)

Three-column layout:

**Left — Triage banner + lanes + list.**
- The banner is dark navy with the radial teal glow, same visual family as the Next Steps panel from day 2B. Calculates real counts: "Sorted X messages. Y need attention today, Z can wait until later this week, W are nice-to-have."
- Four lane tabs (Today / This week / Later / All) with live counts and tone-coded underlines (red for today, amber for week, muted for later).
- Message rows with avatar, name, unread dot, timestamp, subject, body summary, and the AI reason chip in teal italic when present. Active row gets a left teal accent bar.

**Middle — Focused message + drafts.**
- The inbound message rendered as a proper email card with avatar, sender, channel, timestamp, priority pill, subject, full body.
- Below it, the Luna read panel — "Luna's read: <ai_reason>" in a teal pill.
- Then the drafts panel: heading shows count ("Luna · 3 drafts ranked by fit"), tab strip for switching between drafts (with confidence percentages in monospace), the active draft body in a teal-tinted card with the "This one because:" rationale.
- Action buttons: Send as is (primary), Edit before sending, Regenerate (right-aligned).

**Right — Mini customer card.**
- Avatar, name, city + household type, tag pills.
- Stats card: lifetime value, trips booked, customer since, next departure (in monospace numerics).
- Luna's read excerpt (up to 200 chars of the AI brief).
- Heads-up card if the household has notes (amber-toned for Sarah's "bad transfer in Crete 2024").
- Open full record link to the customer detail page.

### Drafts library

Hand-crafted draft replies for the eight seeded interactions, keyed by subject. Sarah's transfer worry has three drafts — the showpiece — ranging from "Reassuring · personal · references Crete" (92% confidence) to "Brief · operational" (78%) to "Warm · light · short" (71%). Each has a one-sentence rationale explaining what trade-off it's making.

The other seeded messages have one or two drafts each. Generic fallback for anything without a library entry.

Day 5 swaps `getDrafts(ix)` for a real Claude call. The UI doesn't change. The draft shape is already what Claude would return.

---

## Decisions made today

**1. Hand-craft the drafts.** Rather than rules-based generation that would feel thin, I wrote actual high-quality drafts for each seeded message. This gives the demo its punch — the Sarah moment in particular, where you see three options and instantly understand which one's right and why.

**2. URL-driven selection.** `?id=...` makes selections shareable. Same pattern as customers segmentation. Means hitting "back" works, and Andy can copy a link to a colleague to discuss a draft.

**3. Three-column layout, fixed.** No collapsible panels yet. Means the inbox feels solid on desktop and the mini-card always has space for the full read. Mobile responsive comes later if needed.

**4. Lane tabs, not lane cards.** The mockup had three big rectangular lane cards. Tabs at the top of the list pane is tighter, more email-app-like, and works better with the list of message rows below.

**5. Mini customer card uses the same household record.** No extra query — same data we already have for the customers list. Keeps it fast.

**6. "Open full record →" link.** From the mini-card you can jump to the full customer detail page. Closes the loop between Inbox → Customer 360.

**7. Sidebar Inbox badge stays at "3".** Hardcoded number happens to match the `today` lane count with current seed data. Can be fixed later by passing a prop to the Sidebar from a Server Component, but that's for after we wire in real-time updates.

---

## What's next

Day 4 — Trips Kanban + per-card predictions.

By the end of day 4 you'll have: dashboard placeholder, customers, customer detail, inbox, trips. That's the four core surfaces. Days 5-7 layer the AI engine on top, plus the dashboard build.

---

## Open questions

None blocking.

---

## How to deploy

Standard drop. Two new files: `app/inbox/page.tsx` (replacing the placeholder) and `app/inbox/inbox-view.tsx`. Plus the build log.
