"use client";

/**
 * Trips board — client component. /trips
 *
 * Owns all interaction:
 *   - Desktop: native HTML5 drag-and-drop between columns
 *   - Touch / keyboard: a stage <select> on each card (accessible fallback,
 *     so the board is fully usable without dragging)
 *   - Optimistic stage change: the card moves immediately, the API write
 *     happens in the background, and on failure the card snaps back with a
 *     toast. Agency owners must trust the board, so we never silently lose a
 *     move.
 *
 * Pure presentation + one mutation. No business logic lives here that isn't
 * about showing or moving a trip.
 */

import { useMemo, useState, useCallback, useRef } from "react";
import Link from "next/link";
import type { Trip, TripStage } from "@/lib/supabase/types";
import {
  STAGE_META,
  BOARD_STAGES,
  DROPPABLE_STAGES,
  formatMoney,
  formatMoneyFull,
  formatDate,
  flagFor,
  closeProbability,
  daysUntil,
} from "@/lib/trips/presentation";

export type BoardTrip = Trip & { household_name: string };

export function TripsBoard({ trips: initialTrips }: { trips: BoardTrip[] }) {
  const [trips, setTrips] = useState<BoardTrip[]>(initialTrips);
  const [showCancelled, setShowCancelled] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<TripStage | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flashToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3200);
  }, []);

  // ─── Group trips by stage ─────────────────────────────────────────────
  const byStage = useMemo(() => {
    const groups: Record<TripStage, BoardTrip[]> = {
      enquiry: [], quoted: [], booked: [], pre_departure: [],
      travelling: [], returned: [], cancelled: [],
    };
    for (const t of trips) groups[t.stage]?.push(t);
    return groups;
  }, [trips]);

  const cancelledCount = byStage.cancelled.length;

  // ─── The actual stage change (optimistic + rollback) ──────────────────
  const moveTrip = useCallback(
    async (tripId: string, toStage: TripStage) => {
      const current = trips.find((t) => t.id === tripId);
      if (!current || current.stage === toStage) return;

      const fromStage = current.stage;

      // Optimistic: move now.
      setTrips((prev) =>
        prev.map((t) => (t.id === tripId ? { ...t, stage: toStage } : t))
      );

      try {
        const res = await fetch(`/api/trips/${tripId}/stage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ stage: toStage }),
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(data.error || `Save failed (${res.status})`);
        }
      } catch (err) {
        // Rollback.
        setTrips((prev) =>
          prev.map((t) => (t.id === tripId ? { ...t, stage: fromStage } : t))
        );
        flashToast(
          err instanceof Error ? `Couldn't move trip — ${err.message}` : "Couldn't move trip"
        );
      }
    },
    [trips, flashToast]
  );

  // ─── Drag handlers ────────────────────────────────────────────────────
  const onDrop = useCallback(
    (stage: TripStage) => {
      if (dragId) moveTrip(dragId, stage);
      setDragId(null);
      setOverStage(null);
    },
    [dragId, moveTrip]
  );

  return (
    <div
      style={{
        padding: "20px 28px 28px",
        width: "100%",
        display: "flex",
        flexDirection: "column",
        gap: 16,
        minHeight: 0,
      }}
    >
      {/* ── Board header: pipeline summary + cancelled toggle ── */}
      <BoardHeader
        trips={trips}
        showCancelled={showCancelled}
        cancelledCount={cancelledCount}
        onToggleCancelled={() => setShowCancelled((v) => !v)}
      />

      {/* ── The board ── */}
      <div
        data-tour="trips-board"
        style={{
          display: "flex",
          gap: 14,
          overflowX: "auto",
          paddingBottom: 8,
          alignItems: "flex-start",
        }}
      >
        {BOARD_STAGES.map((stage) => (
          <Column
            key={stage}
            stage={stage}
            trips={byStage[stage]}
            isOver={overStage === stage}
            onDragOverColumn={() => setOverStage(stage)}
            onDragLeaveColumn={() => setOverStage((s) => (s === stage ? null : s))}
            onDrop={() => onDrop(stage)}
            onCardDragStart={(id) => setDragId(id)}
            onCardDragEnd={() => {
              setDragId(null);
              setOverStage(null);
            }}
            onStageSelect={moveTrip}
            dragging={dragId}
          />
        ))}

        {showCancelled && cancelledCount > 0 && (
          <Column
            stage="cancelled"
            trips={byStage.cancelled}
            isOver={false}
            onDragOverColumn={() => {}}
            onDragLeaveColumn={() => {}}
            onDrop={() => {}}
            onCardDragStart={(id) => setDragId(id)}
            onCardDragEnd={() => setDragId(null)}
            onStageSelect={moveTrip}
            dragging={dragId}
            droppable={false}
          />
        )}
      </div>

      {/* ── Toast ── */}
      {toast && (
        <div
          role="status"
          style={{
            position: "fixed",
            bottom: 24,
            left: "50%",
            transform: "translateX(-50%)",
            background: "var(--surface-elevated)",
            border: "1px solid var(--border-strong)",
            boxShadow: "var(--shadow-lg)",
            borderRadius: 10,
            padding: "10px 16px",
            fontSize: 13,
            color: "var(--text)",
            zIndex: 1000,
            maxWidth: "90vw",
          }}
        >
          {toast}
        </div>
      )}
    </div>
  );
}

// ─── Board header ──────────────────────────────────────────────────────────
function BoardHeader({
  trips,
  showCancelled,
  cancelledCount,
  onToggleCancelled,
}: {
  trips: BoardTrip[];
  showCancelled: boolean;
  cancelledCount: number;
  onToggleCancelled: () => void;
}) {
  // Open pipeline value = everything not returned/cancelled.
  const openValue = trips
    .filter((t) => t.stage !== "returned" && t.stage !== "cancelled")
    .reduce((sum, t) => sum + (t.total_value ?? 0), 0);
  const openCount = trips.filter(
    (t) => t.stage !== "returned" && t.stage !== "cancelled"
  ).length;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: 12,
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
          <span style={{ fontSize: 22, fontWeight: 700, color: "var(--text)", letterSpacing: "-0.01em" }}>
            {formatMoneyFull(openValue)}
          </span>
          <span style={{ fontSize: 13, color: "var(--text-muted)" }}>open pipeline</span>
        </div>
        <span style={{ color: "var(--border-strong)" }}>·</span>
        <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
          {openCount} active {openCount === 1 ? "trip" : "trips"}
        </span>
      </div>

      {cancelledCount > 0 && (
        <button
          onClick={onToggleCancelled}
          aria-pressed={showCancelled}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            background: showCancelled ? "var(--bg-subtle)" : "transparent",
            border: "1px solid var(--border)",
            borderRadius: 6,
            padding: "6px 10px",
            fontSize: 12.5,
            fontWeight: 500,
            color: "var(--text-muted)",
          }}
        >
          {showCancelled ? "Hide" : "Show"} cancelled ({cancelledCount})
        </button>
      )}
    </div>
  );
}

// ─── Column ──────────────────────────────────────────────────────────────
function Column({
  stage,
  trips,
  isOver,
  onDragOverColumn,
  onDragLeaveColumn,
  onDrop,
  onCardDragStart,
  onCardDragEnd,
  onStageSelect,
  dragging,
  droppable = true,
}: {
  stage: TripStage;
  trips: BoardTrip[];
  isOver: boolean;
  onDragOverColumn: () => void;
  onDragLeaveColumn: () => void;
  onDrop: () => void;
  onCardDragStart: (id: string) => void;
  onCardDragEnd: () => void;
  onStageSelect: (id: string, stage: TripStage) => void;
  dragging: string | null;
  droppable?: boolean;
}) {
  const meta = STAGE_META[stage];
  const total = trips.reduce((sum, t) => sum + (t.total_value ?? 0), 0);

  return (
    <div
      onDragOver={(e) => {
        if (!droppable) return;
        e.preventDefault();
        onDragOverColumn();
      }}
      onDragLeave={onDragLeaveColumn}
      onDrop={(e) => {
        if (!droppable) return;
        e.preventDefault();
        onDrop();
      }}
      style={{
        flex: "0 0 272px",
        width: 272,
        background: isOver ? "var(--hover)" : "var(--bg-subtle)",
        border: `1px solid ${isOver ? "var(--tg-accent)" : "var(--border)"}`,
        borderRadius: 12,
        padding: 10,
        transition: "background 0.12s ease, border-color 0.12s ease",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        maxHeight: "calc(100vh - var(--topbar-h) - 130px)",
      }}
    >
      {/* Column header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "2px 4px 6px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              color: meta.fg,
              background: meta.bg,
              padding: "3px 8px",
              borderRadius: 6,
            }}
          >
            {meta.label}
          </span>
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)" }}>
            {trips.length}
          </span>
        </div>
        {total > 0 && (
          <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-subtle)" }}>
            {formatMoney(total)}
          </span>
        )}
      </div>

      {/* Cards */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8, overflowY: "auto", minHeight: 40 }}>
        {trips.length === 0 ? (
          <div
            style={{
              border: "1px dashed var(--border)",
              borderRadius: 8,
              padding: "16px 10px",
              textAlign: "center",
              fontSize: 12,
              color: "var(--text-subtle)",
            }}
          >
            {droppable ? "Drop a trip here" : "Nothing here"}
          </div>
        ) : (
          trips.map((trip) => (
            <TripCard
              key={trip.id}
              trip={trip}
              onDragStart={() => onCardDragStart(trip.id)}
              onDragEnd={onCardDragEnd}
              onStageSelect={(s) => onStageSelect(trip.id, s)}
              isDragging={dragging === trip.id}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ─── Card ──────────────────────────────────────────────────────────────────
function TripCard({
  trip,
  onDragStart,
  onDragEnd,
  onStageSelect,
  isDragging,
}: {
  trip: BoardTrip;
  onDragStart: () => void;
  onDragEnd: () => void;
  onStageSelect: (stage: TripStage) => void;
  isDragging: boolean;
}) {
  const prob = closeProbability(trip.ai_predictions);
  const dUntil =
    trip.stage === "pre_departure" || trip.stage === "booked"
      ? daysUntil(trip.depart_date)
      : null;

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        // Some browsers need data set for drag to initiate.
        e.dataTransfer.setData("text/plain", trip.id);
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 10,
        padding: 11,
        boxShadow: "var(--shadow-sm)",
        cursor: "grab",
        opacity: isDragging ? 0.4 : 1,
        transition: "opacity 0.12s ease, box-shadow 0.12s ease",
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      {/* Destination + flag */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
        <span style={{ fontSize: 16, lineHeight: 1.2 }} aria-hidden="true">
          {flagFor(trip.destination_country)}
        </span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              fontSize: 13.5,
              fontWeight: 600,
              color: "var(--text)",
              lineHeight: 1.3,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
            title={trip.destination ?? undefined}
          >
            {trip.destination ?? "—"}
          </div>
          <Link
            href={`/customers/${trip.household_id}`}
            style={{
              fontSize: 11.5,
              color: "var(--text-muted)",
              textDecoration: "none",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              display: "block",
            }}
            title={trip.household_name}
          >
            {trip.household_name}
          </Link>
        </div>
      </div>

      {/* Value + occasion + dates */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 6, flexWrap: "wrap" }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>
          {formatMoney(trip.total_value)}
        </span>
        {trip.occasion && (
          <span style={{ fontSize: 11, color: "var(--text-subtle)" }}>· {trip.occasion}</span>
        )}
      </div>

      {trip.depart_date && (
        <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
          {formatDate(trip.depart_date)}
          {dUntil != null && dUntil >= 0 && (
            <span
              style={{
                marginLeft: 6,
                color: dUntil <= 7 ? "var(--warning)" : "var(--text-subtle)",
                fontWeight: dUntil <= 7 ? 600 : 400,
              }}
            >
              {dUntil === 0 ? "today" : `in ${dUntil}d`}
            </span>
          )}
        </div>
      )}

      {/* Close probability bar (only when predicted) */}
      {prob != null && (trip.stage === "enquiry" || trip.stage === "quoted") && (
        <div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: 10,
              color: "var(--text-subtle)",
              marginBottom: 3,
            }}
          >
            <span style={{ letterSpacing: "0.04em", textTransform: "uppercase", fontWeight: 600 }}>
              Likely to close
            </span>
            <span style={{ fontWeight: 600, color: "var(--text-muted)" }}>{prob}%</span>
          </div>
          <div style={{ height: 4, borderRadius: 999, background: "var(--bg-subtle)", overflow: "hidden" }}>
            <div
              style={{
                width: `${prob}%`,
                height: "100%",
                borderRadius: 999,
                background: prob >= 60 ? "var(--success)" : prob >= 35 ? "var(--warning)" : "var(--text-subtle)",
              }}
            />
          </div>
        </div>
      )}

      {/* Footer: reference + stage select (touch/keyboard fallback) */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          paddingTop: 6,
          borderTop: "1px solid var(--border)",
        }}
      >
        {trip.reference ? (
          <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 10, color: "var(--text-subtle)" }}>
            {trip.reference}
          </span>
        ) : (
          <span />
        )}
        <label style={{ display: "inline-flex", alignItems: "center" }}>
          <span
            style={{
              position: "absolute",
              width: 1,
              height: 1,
              overflow: "hidden",
              clip: "rect(0 0 0 0)",
            }}
          >
            Change stage for {trip.destination ?? "trip"}
          </span>
          <select
            value={trip.stage}
            onChange={(e) => onStageSelect(e.target.value as TripStage)}
            onClick={(e) => e.stopPropagation()}
            style={{
              fontSize: 10.5,
              color: "var(--text-muted)",
              background: "var(--bg-subtle)",
              border: "1px solid var(--border)",
              borderRadius: 5,
              padding: "2px 4px",
              cursor: "pointer",
              maxWidth: 110,
            }}
          >
            {DROPPABLE_STAGES.map((s) => (
              <option key={s} value={s}>
                {STAGE_META[s].label}
              </option>
            ))}
            {/* allow leaving a card on cancelled visible in the dropdown */}
            {trip.stage === "cancelled" && <option value="cancelled">Cancelled</option>}
          </select>
        </label>
      </div>
    </div>
  );
}
