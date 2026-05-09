"use client";

import { useState, useMemo, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  parseQueryToTokens,
  SAVED_SEGMENTS,
  type Token,
} from "@/lib/segmentation/parse";
import {
  SparklesIcon,
  ClockIcon,
  PlaneIcon,
  UsersIcon,
  HomeIcon,
  XIcon,
  SendIcon,
  NoteIcon,
  PlusIcon,
  SearchIcon,
} from "@/components/ui/icons";
import type { Household } from "@/lib/supabase/types";

type Props = {
  initialQuery: string;
  initialTokens: Token[];
  initialActiveSegment: string | null;
  households: Household[];
  totalCount: number;
  segmentCounts: Record<string, number>;
  density: "compact" | "comfortable";
};

// Avatar colour from a string (deterministic)
const avatarColors = [
  "#FF8E8E", "#FFB57E", "#FFD96B", "#A8D86F",
  "#6BD4C5", "#6BB3D4", "#9D8FE0", "#D87EAA",
];
function avatarColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return avatarColors[Math.abs(h) % avatarColors.length];
}
function initials(name: string): string {
  const parts = name.replace(/\(.*?\)/g, "").trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const second = parts.find((p, i) => i > 0 && /^[A-Z]/.test(p))?.[0] ?? parts[1]?.[0] ?? "";
  return (first + second).toUpperCase().slice(0, 2);
}
function formatMoney(n: number): string {
  if (n >= 1000) return `£${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  return `£${n.toLocaleString("en-GB")}`;
}

const tokenIcons = {
  plane: PlaneIcon, clock: ClockIcon, users: UsersIcon,
  sparkles: SparklesIcon, home: HomeIcon,
};

export function CustomersView({
  initialQuery,
  initialTokens,
  initialActiveSegment,
  households,
  totalCount,
  segmentCounts,
  density,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [inputValue, setInputValue] = useState(initialQuery);
  const [textSearch, setTextSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // ─── Apply local text search on top of server-filtered households ──
  const visible = useMemo(() => {
    if (!textSearch.trim()) return households;
    const q = textSearch.toLowerCase();
    return households.filter((h) =>
      h.display_name.toLowerCase().includes(q) ||
      (h.city ?? "").toLowerCase().includes(q)
    );
  }, [households, textSearch]);

  // ─── Navigation helpers (URL-driven state) ─────────────────────────
  function applyQuery(q: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (q) params.set("q", q);
    else params.delete("q");
    params.delete("seg");
    setSelected(new Set());
    startTransition(() => {
      router.push(`/customers?${params.toString()}`);
    });
  }

  function applySegment(segId: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (initialActiveSegment === segId) {
      params.delete("seg");
    } else {
      params.set("seg", segId);
    }
    params.delete("q");
    setInputValue("");
    setSelected(new Set());
    startTransition(() => {
      router.push(`/customers?${params.toString()}`);
    });
  }

  function clearAll() {
    setInputValue("");
    setSelected(new Set());
    startTransition(() => {
      router.push("/customers");
    });
  }

  function removeToken(idx: number) {
    // Re-derive query without that token's contribution. Easiest: clear all,
    // since tokens come from a single query string. Better day 5 with Claude:
    // tokens become first-class and removable individually.
    if (initialActiveSegment) {
      // Saved segment is active — just clear it
      clearAll();
      return;
    }
    // For a free-text query, dropping one token is fuzzy. Pragmatic approach:
    // re-emit the parsed labels as the new query, minus the dropped one.
    const remaining = initialTokens
      .filter((_, i) => i !== idx)
      .map((t) => t.label.toLowerCase())
      .join(" ");
    applyQuery(remaining);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    applyQuery(inputValue.trim());
  }

  // ─── Stats for the result summary ──────────────────────────────────
  const totalLTV = visible.reduce((s, h) => s + (h.lifetime_value || 0), 0);
  const vipCount = visible.filter((h) => h.tags?.includes("VIP")).length;
  const selectedLTV = visible
    .filter((h) => selected.has(h.id))
    .reduce((s, h) => s + (h.lifetime_value || 0), 0);

  return (
    <>
      {/* ─── Smart Segmentation bar ─────────────────────────── */}
      <form
        onSubmit={handleSubmit}
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 14,
          overflow: "hidden",
          marginBottom: 16,
          transition: "border-color 0.2s ease, box-shadow 0.2s ease",
          opacity: isPending ? 0.7 : 1,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            padding: "14px 18px",
            gap: 12,
          }}
        >
          <div
            style={{
              width: 24,
              height: 24,
              borderRadius: "50%",
              background:
                "radial-gradient(circle at 30% 30%, #48CAE4 0%, #00B4D8 60%, #1B2B5B 100%)",
              flexShrink: 0,
              boxShadow: "0 0 8px rgba(72, 202, 228, 0.3)",
            }}
          />
          <input
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Ask Luna a question, or describe the customers you want…"
            autoComplete="off"
            style={{
              flex: 1,
              border: "none",
              outline: "none",
              background: "transparent",
              color: "var(--text)",
              fontFamily: "inherit",
              fontSize: 14.5,
              fontWeight: 500,
            }}
          />
          {(inputValue || initialTokens.length > 0) && (
            <button
              type="button"
              onClick={clearAll}
              style={{
                background: "transparent",
                border: "none",
                color: "var(--text-muted)",
                fontSize: 12,
                cursor: "pointer",
                padding: "2px 6px",
                borderRadius: 4,
              }}
            >
              Clear
            </button>
          )}
          <span
            style={{
              fontFamily: '"JetBrains Mono", monospace',
              fontSize: 10,
              color: "var(--text-subtle)",
              background: "var(--bg-subtle)",
              border: "1px solid var(--border)",
              borderRadius: 4,
              padding: "2px 6px",
            }}
          >
            ↵ to ask
          </span>
        </div>

        {initialTokens.length > 0 && (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 6,
              padding: "0 18px 14px",
              alignItems: "center",
              borderBottom: "1px solid var(--border)",
            }}
          >
            <span
              style={{
                fontSize: 10.5,
                fontWeight: 600,
                color: "var(--text-subtle)",
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                marginRight: 4,
              }}
            >
              Luna heard
            </span>
            {initialTokens.map((t, i) => {
              const Icon = tokenIcons[t.icon];
              return (
                <span
                  key={`${t.type}-${i}-${t.label}`}
                  style={{
                    background: "rgba(0, 180, 216, 0.08)",
                    border: "1px solid rgba(0, 180, 216, 0.2)",
                    color: "var(--tg-accent-dark)",
                    fontSize: 12,
                    fontWeight: 500,
                    padding: "3px 9px",
                    borderRadius: 6,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                    animation: `fadeUp 0.3s ease-out ${i * 60}ms backwards`,
                  }}
                >
                  <Icon width={11} height={11} style={{ opacity: 0.7 }} />
                  {t.label}
                  <button
                    type="button"
                    onClick={() => removeToken(i)}
                    aria-label="Remove filter"
                    style={{
                      background: "transparent",
                      border: "none",
                      color: "currentColor",
                      cursor: "pointer",
                      opacity: 0.5,
                      padding: 0,
                      marginLeft: 2,
                      fontSize: 13,
                      lineHeight: 1,
                    }}
                  >
                    ×
                  </button>
                </span>
              );
            })}
          </div>
        )}

        {(initialTokens.length > 0 || initialActiveSegment) && (
          <div
            style={{
              padding: "10px 18px",
              background: "var(--bg-subtle)",
              display: "flex",
              alignItems: "center",
              gap: 10,
              fontSize: 12.5,
              color: "var(--text-muted)",
            }}
          >
            <span>
              <strong style={{ color: "var(--text)", fontWeight: 600 }}>
                {visible.length}
              </strong>{" "}
              customers match · {formatMoney(totalLTV)} combined LTV
              {vipCount > 0 && ` · ${vipCount} VIP${vipCount > 1 ? "s" : ""}`}
            </span>
            <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
              <button type="button" style={pillBtn("ghost")}>
                <SendIcon width={12} height={12} /> Email all
              </button>
              <button type="button" style={pillBtn("ghost")}>
                <NoteIcon width={12} height={12} /> Add to journey
              </button>
              <button type="button" style={pillBtn("primary")}>
                <PlusIcon width={12} height={12} /> Save segment
              </button>
            </div>
          </div>
        )}
      </form>

      {/* ─── Saved segment chips ─────────────────────────────── */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 7,
          marginBottom: 14,
          alignItems: "center",
        }}
      >
        <span
          style={{
            fontSize: 10.5,
            fontWeight: 600,
            color: "var(--text-subtle)",
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            marginRight: 2,
          }}
        >
          Saved
        </span>
        {SAVED_SEGMENTS.map((s) => {
          const active = initialActiveSegment === s.id;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => applySegment(s.id)}
              style={{
                background: active ? "var(--tg-primary)" : "var(--surface)",
                border: `1px solid ${
                  active ? "var(--tg-primary)" : "var(--border)"
                }`,
                color: active ? "white" : "var(--text-muted)",
                borderRadius: 999,
                padding: "5px 12px",
                fontSize: 12,
                fontWeight: 500,
                cursor: "pointer",
                transition: "all 0.12s ease",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <SparklesIcon width={11} height={11} />
              {s.label}
              <span
                style={{
                  fontFamily: '"JetBrains Mono", monospace',
                  fontSize: 10.5,
                  opacity: 0.7,
                }}
              >
                {segmentCounts[s.id] ?? 0}
              </span>
            </button>
          );
        })}
      </div>

      {/* ─── Toolbar: text search ───────────────────────────── */}
      <div
        style={{
          display: "flex",
          gap: 8,
          marginBottom: 12,
          alignItems: "center",
        }}
      >
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            gap: 8,
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            padding: "6px 10px",
          }}
        >
          <SearchIcon width={14} height={14} style={{ color: "var(--text-subtle)" }} />
          <input
            value={textSearch}
            onChange={(e) => setTextSearch(e.target.value)}
            placeholder={`Filter the ${visible.length} below by name or city…`}
            style={{
              flex: 1,
              border: "none",
              outline: "none",
              background: "transparent",
              color: "var(--text)",
              fontFamily: "inherit",
              fontSize: 13,
            }}
          />
        </div>
        <span style={{ fontSize: 12, color: "var(--text-subtle)" }}>
          Showing {visible.length} of {totalCount}
        </span>
      </div>

      {/* ─── Bulk action bar ────────────────────────────────── */}
      {selected.size > 0 && (
        <div
          style={{
            background: "var(--tg-primary)",
            color: "white",
            borderRadius: 10,
            padding: "10px 16px",
            marginBottom: 12,
            display: "flex",
            alignItems: "center",
            gap: 10,
            animation: "fadeUp 0.2s ease-out",
          }}
        >
          <span style={{ fontWeight: 600, fontSize: 13 }}>
            {selected.size} selected
          </span>
          <span style={{ opacity: 0.6, fontSize: 12 }}>·</span>
          <span style={{ fontSize: 12, opacity: 0.85 }}>
            {formatMoney(selectedLTV)} combined LTV
          </span>
          <div style={{ flex: 1 }} />
          <button style={bulkBtn()}>
            <SendIcon width={12} height={12} /> Email selected
          </button>
          <button style={bulkBtn()}>
            <NoteIcon width={12} height={12} /> Add tag
          </button>
          <button style={bulkBtn()}>
            <SparklesIcon width={12} height={12} /> Draft outreach
          </button>
        </div>
      )}

      {/* ─── Table ──────────────────────────────────────────── */}
      <div
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 12,
          overflow: "hidden",
        }}
      >
        {visible.length === 0 ? (
          <div
            style={{
              padding: "60px 20px",
              textAlign: "center",
            }}
          >
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 12,
                background: "var(--bg-subtle)",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 12,
                color: "var(--text-subtle)",
              }}
            >
              <UsersIcon width={22} height={22} />
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>
              No customers match this query
            </div>
            <div style={{ fontSize: 12.5, color: "var(--text-muted)" }}>
              Try removing a token, or describe the customers differently.
            </div>
          </div>
        ) : (
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: 13,
            }}
          >
            <thead>
              <tr
                style={{
                  background: "var(--bg-subtle)",
                  borderBottom: "1px solid var(--border)",
                }}
              >
                <th style={th({ width: 36, paddingRight: 0 })}></th>
                <th style={th()}>Customer</th>
                <th style={th()}>Type</th>
                <th style={th()}>City</th>
                <th style={th({ textAlign: "right" })}>LTV</th>
                <th style={th()}>Tags</th>
                <th style={th()}>Trips</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((h, i) => {
                const isSelected = selected.has(h.id);
                const cellPad = density === "compact" ? "8px 14px" : "12px 14px";
                return (
                  <tr
                    key={h.id}
                    onClick={() => router.push(`/customers/${h.id}`)}
                    style={{
                      borderBottom:
                        i < visible.length - 1
                          ? "1px solid var(--border)"
                          : "none",
                      cursor: "pointer",
                      background: isSelected ? "var(--bg-subtle)" : "transparent",
                      animation: `fadeUp 0.25s ease-out ${Math.min(i, 12) * 25}ms backwards`,
                    }}
                  >
                    <td
                      style={{
                        padding: cellPad,
                        paddingRight: 0,
                      }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {
                          const next = new Set(selected);
                          if (next.has(h.id)) next.delete(h.id);
                          else next.add(h.id);
                          setSelected(next);
                        }}
                      />
                    </td>
                    <td style={{ padding: cellPad }}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                        }}
                      >
                        <div
                          style={{
                            width: 32,
                            height: 32,
                            borderRadius: 9,
                            background: avatarColor(h.display_name),
                            color: "white",
                            fontWeight: 600,
                            fontSize: 11,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            flexShrink: 0,
                          }}
                        >
                          {initials(h.display_name)}
                        </div>
                        <div>
                          <div style={{ fontWeight: 600, color: "var(--text)" }}>
                            {h.display_name}
                          </div>
                          {h.next_departure && (
                            <div
                              style={{
                                fontSize: 11,
                                color: "var(--text-subtle)",
                                marginTop: 1,
                              }}
                            >
                              Next departure {formatDate(h.next_departure)}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: cellPad }}>
                      <span style={typePill(h.household_type)}>
                        {capitalize(h.household_type ?? "—")}
                      </span>
                    </td>
                    <td style={{ padding: cellPad, color: "var(--text-muted)" }}>
                      {h.city ?? "—"}
                    </td>
                    <td
                      style={{
                        padding: cellPad,
                        textAlign: "right",
                        fontWeight: 600,
                        fontFamily: '"JetBrains Mono", monospace',
                      }}
                    >
                      {formatMoney(h.lifetime_value || 0)}
                    </td>
                    <td style={{ padding: cellPad }}>
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                        {(h.tags ?? []).slice(0, 2).map((tag) => (
                          <span key={tag} style={tagPill(tag)}>
                            {tag}
                          </span>
                        ))}
                        {(h.tags?.length ?? 0) > 2 && (
                          <span
                            style={{
                              fontSize: 11,
                              color: "var(--text-subtle)",
                            }}
                          >
                            +{h.tags!.length - 2}
                          </span>
                        )}
                      </div>
                    </td>
                    <td
                      style={{
                        padding: cellPad,
                        color: "var(--text-muted)",
                        fontFamily: '"JetBrains Mono", monospace',
                        fontSize: 12,
                      }}
                    >
                      {h.trips_count ?? 0}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

// ─── Style helpers ──────────────────────────────────────────────────────
function th(extra?: React.CSSProperties): React.CSSProperties {
  return {
    textAlign: "left",
    padding: "10px 14px",
    fontSize: 11,
    fontWeight: 600,
    color: "var(--text-subtle)",
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    ...extra,
  };
}

function pillBtn(variant: "ghost" | "primary"): React.CSSProperties {
  return {
    background: variant === "primary" ? "var(--tg-primary)" : "var(--surface)",
    color: variant === "primary" ? "white" : "var(--text)",
    border: `1px solid ${variant === "primary" ? "var(--tg-primary)" : "var(--border)"}`,
    borderRadius: 6,
    padding: "4px 10px",
    fontSize: 12,
    fontWeight: 500,
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
  };
}

function bulkBtn(): React.CSSProperties {
  return {
    background: "rgba(255, 255, 255, 0.15)",
    border: "1px solid rgba(255, 255, 255, 0.2)",
    color: "white",
    borderRadius: 7,
    padding: "5px 11px",
    fontSize: 12.5,
    fontWeight: 500,
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
  };
}

function typePill(t: string | null): React.CSSProperties {
  return {
    fontSize: 11,
    padding: "2px 7px",
    borderRadius: 5,
    background: "var(--bg-subtle)",
    color: "var(--text-muted)",
    border: "1px solid var(--border)",
    textTransform: "capitalize",
    fontWeight: 500,
  };
}

function tagPill(tag: string): React.CSSProperties {
  const isVip = tag === "VIP";
  return {
    fontSize: 10.5,
    padding: "2px 7px",
    borderRadius: 5,
    background: isVip ? "rgba(239, 68, 68, 0.08)" : "rgba(0, 180, 216, 0.08)",
    color: isVip ? "var(--error)" : "var(--tg-accent-dark)",
    border: `1px solid ${isVip ? "rgba(239, 68, 68, 0.2)" : "rgba(0, 180, 216, 0.2)"}`,
    fontWeight: 600,
    letterSpacing: "0.02em",
  };
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatDate(s: string | null): string {
  if (!s) return "";
  const d = new Date(s);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
