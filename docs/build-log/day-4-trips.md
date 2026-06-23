# Day 4 — Trips (pipeline Kanban)

**Status:** Complete (build log backfilled during the completion pass)
**Goal:** A drag-and-drop pipeline board where a trip looks and behaves the same as it does on the customer page.

---

## What we built

### Shared trip presentation (`lib/trips/presentation.ts`)

One source of truth for stage colours and labels (`STAGE_META`), the board's stage order (`BOARD_STAGES`), money/date formatting, country flags, and small helpers (`closeProbability`, `daysUntil`). The customer detail page and the board both import these so a trip never drifts between screens.

### Trips board (`app/trips/page.tsx` + `trips-view.tsx`)

- **Server Component** fetches all trips for the agency and joins each household's display name in memory (two round-trips, not N).
- **Client board** owns the interaction:
  - Desktop native HTML5 drag-and-drop between columns.
  - An accessible stage `<select>` on every card, so the board is fully usable by touch and keyboard without dragging.
  - **Optimistic stage change**: the card moves immediately, the API write happens in the background, and on failure it snaps back with a toast. Owners have to trust the board, so a move is never silently lost.
  - A cancelled-trips toggle (cancelled is an exit, not a pipeline column).
- Empty state points at the same `/api/seed` flow as the customers page.

### Stage mutation (`app/api/trips/[id]/stage`)

POST with a whitelisted stage enum, UUID-validated id, agency-scoped update. The shape stays the same when auth + RLS land in phase 2.

---

## Decisions

1. **Optimistic, with rollback.** Speed plus honesty: the move shows instantly but a failed write undoes it visibly.
2. **Accessible fallback is first-class, not an afterthought.** Drag is nice; the `<select>` means nobody is locked out.
3. **Cancelled is not a column.** It is reachable via the dropdown and a toggle, never a drop target, so a stray drag cannot cancel a trip.
