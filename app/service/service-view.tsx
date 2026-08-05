"use client";

/**
 * Service queue — the working half of /service.
 *
 * Open cases come pre-sorted by priority then SLA pressure (the server
 * orders them). Each row shows the P-badge with its computed reason on
 * hover, the travel context, and an SLA countdown reusing the same clock
 * as the enquiries screen. Lifecycle: Start, Waiting, Resolve (with the
 * outcome recorded), Reopen.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { CaseRow } from "@/lib/supabase/types";
import { clockState } from "@/lib/enquiries/clock";
import {
  CASE_TYPE_LABELS,
  PRIORITY_META,
  CASE_STATUS_LABELS as STATUS_LABEL,
  type CaseType,
} from "@/lib/cases/priority";
import { CheckIcon, ClockIcon } from "@/components/ui/icons";

export type ServiceViewProps = {
  cases: CaseRow[];
  nameById: Record<string, string>;
  tripMeta: Record<string, { destination: string | null; depart_date: string | null; stage: string }>;
};

type Tab = "open" | "resolved" | "all";

const TABS: { key: Tab; label: string }[] = [
  { key: "open", label: "Open" },
  { key: "resolved", label: "Resolved" },
  { key: "all", label: "All" },
];

export function ServiceView({ cases, nameById, tripMeta }: ServiceViewProps) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("open");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [resolution, setResolution] = useState("");

  const nowIso = new Date().toISOString();

  const counts = useMemo(() => {
    const open = cases.filter((c) => !["resolved", "closed"].includes(c.status)).length;
    return {
      open,
      resolved: cases.filter((c) => ["resolved", "closed"].includes(c.status)).length,
      all: cases.length,
    } as Record<Tab, number>;
  }, [cases]);

  const visible = useMemo(
    () =>
      cases.filter((c) => {
        if (tab === "all") return true;
        const resolved = ["resolved", "closed"].includes(c.status);
        return tab === "resolved" ? resolved : !resolved;
      }),
    [cases, tab]
  );

  async function act(id: string, action: string, extra: Record<string, unknown> = {}) {
    setError(null);
    setBusyId(id);
    try {
      const res = await fetch(`/api/cases/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error || `Failed (${res.status})`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusyId(null);
      setResolvingId(null);
      setResolution("");
    }
  }

  const btn: React.CSSProperties = {
    background: "transparent",
    border: "1px solid var(--border)",
    borderRadius: 6,
    padding: "5px 10px",
    fontSize: 12,
    fontWeight: 500,
    color: "var(--text-muted)",
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
  };

  return (
    <div style={{ padding: "20px 24px" }}>
      <div data-tour="service-tabs" style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
        {TABS.map(({ key, label }) => {
          const active = tab === key;
          return (
            <button
              key={key}
              onClick={() => setTab(key)}
              style={{
                background: active ? "var(--tg-primary)" : "var(--surface)",
                color: active ? "white" : "var(--text-muted)",
                border: `1px solid ${active ? "var(--tg-primary)" : "var(--border)"}`,
                borderRadius: 999,
                padding: "5px 12px",
                fontSize: 12.5,
                fontWeight: active ? 600 : 500,
                cursor: "pointer",
              }}
            >
              {label}
              <span style={{ opacity: 0.75, marginLeft: 5, fontSize: 11 }}>{counts[key]}</span>
            </button>
          );
        })}
      </div>

      {error && <div style={{ marginBottom: 12, fontSize: 12.5, color: "var(--error)" }}>{error}</div>}

      {visible.length === 0 && (
        <div
          style={{
            border: "1px dashed var(--border)",
            borderRadius: 12,
            padding: "48px 24px",
            textAlign: "center",
            color: "var(--text-subtle)",
            fontSize: 13.5,
          }}
        >
          {tab === "open"
            ? "No open cases. Every customer problem is either solved or hasn't happened yet."
            : "Nothing here yet."}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {visible.map((c) => {
          const p = PRIORITY_META[c.priority] ?? PRIORITY_META[3];
          const busy = busyId === c.id;
          const resolved = ["resolved", "closed"].includes(c.status);
          const householdName = c.household_id ? nameById[c.household_id] : null;
          const trip = c.trip_id ? tripMeta[c.trip_id] : null;
          const clock = !resolved
            ? clockState({
                receivedAt: c.opened_at,
                dueAt: c.sla_due_at,
                respondedAt: null,
                now: nowIso,
              })
            : null;
          const clockColour =
            clock?.state === "overdue"
              ? { bg: "rgba(220,38,38,0.12)", fg: "#dc2626" }
              : clock?.state === "warning"
                ? { bg: "rgba(217,119,6,0.12)", fg: "#d97706" }
                : { bg: "rgba(5,150,105,0.10)", fg: "#059669" };

          return (
            <div
              key={c.id}
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: 12,
                padding: "14px 16px",
              }}
            >
              <div style={{ display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 260 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span
                      title={c.priority_reason ?? undefined}
                      style={{
                        background: p.bg,
                        color: p.fg,
                        borderRadius: 6,
                        padding: "2px 8px",
                        fontSize: 10.5,
                        fontWeight: 700,
                        cursor: c.priority_reason ? "help" : "default",
                      }}
                    >
                      {p.label}
                    </span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>
                      {c.subject}
                    </span>
                    <span style={{ fontSize: 11, color: "var(--text-subtle)" }}>
                      {CASE_TYPE_LABELS[c.case_type as CaseType] ?? c.case_type} · {STATUS_LABEL[c.status]}
                    </span>
                  </div>

                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 6, fontSize: 11.5, color: "var(--text-muted)" }}>
                    {householdName && c.household_id && (
                      <Link
                        href={`/customers/${c.household_id}`}
                        style={{ color: "var(--tg-primary)", textDecoration: "none", fontWeight: 600 }}
                      >
                        {householdName} ↗
                      </Link>
                    )}
                    {trip && (
                      <span>
                        {trip.destination ?? "trip"}
                        {trip.stage === "travelling"
                          ? " · travelling now"
                          : trip.depart_date
                            ? ` · departs ${new Date(trip.depart_date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`
                            : ""}
                      </span>
                    )}
                    <span>
                      opened{" "}
                      {new Date(c.opened_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                    </span>
                  </div>

                  {c.detail && (
                    <div
                      style={{
                        marginTop: 6,
                        fontSize: 12.5,
                        color: "var(--text-muted)",
                        lineHeight: 1.5,
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                      }}
                    >
                      {c.detail}
                    </div>
                  )}
                  {resolved && c.resolution && (
                    <div style={{ marginTop: 6, fontSize: 12, color: "var(--text)", fontStyle: "italic" }}>
                      Resolved: {c.resolution}
                    </div>
                  )}
                </div>

                {clock && (
                  <span
                    title="Time left against this priority's resolution target"
                    style={{
                      background: clockColour.bg,
                      color: clockColour.fg,
                      borderRadius: 6,
                      padding: "3px 9px",
                      fontSize: 11.5,
                      fontWeight: 700,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {clock.label}
                  </span>
                )}
              </div>

              {/* Actions */}
              {!resolved ? (
                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    marginTop: 12,
                    paddingTop: 12,
                    borderTop: "1px solid var(--border)",
                    flexWrap: "wrap",
                    alignItems: "center",
                  }}
                >
                  {c.status === "open" && (
                    <button onClick={() => act(c.id, "start")} disabled={busy} style={{ ...btn, opacity: busy ? 0.6 : 1 }}>
                      Start working it
                    </button>
                  )}
                  {c.status !== "waiting" && (
                    <button
                      onClick={() => act(c.id, "wait")}
                      disabled={busy}
                      title="Waiting on the customer or a supplier"
                      style={{ ...btn, opacity: busy ? 0.6 : 1 }}
                    >
                      <ClockIcon width={11} height={11} /> Waiting on someone
                    </button>
                  )}
                  {resolvingId === c.id ? (
                    <span style={{ display: "inline-flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                      <input
                        autoFocus
                        value={resolution}
                        onChange={(ev) => setResolution(ev.target.value)}
                        onKeyDown={(ev) => {
                          if (ev.key === "Enter") void act(c.id, "resolve", { resolution });
                          if (ev.key === "Escape") setResolvingId(null);
                        }}
                        placeholder="How was it resolved?"
                        style={{
                          border: "1px solid var(--border)",
                          borderRadius: 6,
                          background: "var(--surface)",
                          color: "var(--text)",
                          padding: "5px 9px",
                          fontSize: 12,
                          width: 260,
                          fontFamily: "inherit",
                        }}
                      />
                      <button onClick={() => act(c.id, "resolve", { resolution })} disabled={busy} style={{ ...btn, opacity: busy ? 0.6 : 1 }}>
                        Save
                      </button>
                      <button onClick={() => setResolvingId(null)} style={{ ...btn, border: "none" }}>
                        Cancel
                      </button>
                    </span>
                  ) : (
                    <button
                      onClick={() => { setResolvingId(c.id); setResolution(""); }}
                      disabled={busy}
                      style={{ ...btn, color: "#059669", borderColor: "rgba(5,150,105,0.4)", opacity: busy ? 0.6 : 1 }}
                    >
                      <CheckIcon width={12} height={12} /> Resolve
                    </button>
                  )}
                </div>
              ) : (
                <div style={{ display: "flex", gap: 8, marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
                  <button onClick={() => act(c.id, "reopen")} disabled={busy} style={{ ...btn, opacity: busy ? 0.6 : 1 }}>
                    Reopen
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
