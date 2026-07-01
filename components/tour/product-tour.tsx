"use client";

/**
 * Product tour overlay — a step-by-step walkthrough of set-up and every screen.
 *
 * - Auto-opens once on a first visit (localStorage flag), then only on demand.
 * - Each step can deep-link to the screen it describes; the overlay lives in
 *   AppShell so it stays open across client-side navigation.
 * - Fully keyboard friendly: arrows to move, Esc to close.
 */

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTour } from "./tour-context";
import { TOUR_STEPS } from "./tour-content";
import { SparklesIcon, XIcon } from "@/components/ui/icons";

const SEEN_KEY = "luna_tour_v1_seen";

export function ProductTour() {
  const router = useRouter();
  const { open, setOpen } = useTour();
  const [step, setStep] = useState(0);

  // Auto-open once, shortly after first load, so it doesn't fight hydration.
  useEffect(() => {
    if (typeof window === "undefined") return;
    let seen = false;
    try {
      seen = window.localStorage.getItem(SEEN_KEY) === "1";
    } catch {
      seen = false;
    }
    if (!seen) {
      const t = setTimeout(() => setOpen(true), 600);
      return () => clearTimeout(t);
    }
  }, [setOpen]);

  const markSeen = useCallback(() => {
    try {
      window.localStorage.setItem(SEEN_KEY, "1");
    } catch {
      /* private mode — fine, it just reopens next time */
    }
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    markSeen();
  }, [setOpen, markSeen]);

  // Reset to the first step each time the tour is opened.
  useEffect(() => {
    if (open) setStep(0);
  }, [open]);

  const total = TOUR_STEPS.length;
  const atEnd = step >= total - 1;
  const current = TOUR_STEPS[step];

  const next = useCallback(() => {
    if (atEnd) close();
    else setStep((s) => Math.min(s + 1, total - 1));
  }, [atEnd, close, total]);

  const back = useCallback(() => setStep((s) => Math.max(s - 1, 0)), []);

  // Keyboard control while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      else if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") back();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close, next, back]);

  if (!open) return null;

  function goToPage() {
    if (current.href) router.push(current.href);
    next();
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Product tour"
      onClick={close}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        background: "rgba(2, 6, 23, 0.55)",
        backdropFilter: "blur(2px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        animation: "fadeUp 0.18s ease-out",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 460,
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 16,
          boxShadow: "var(--shadow-lg)",
          overflow: "hidden",
        }}
      >
        {/* Header band */}
        <div
          style={{
            background: "linear-gradient(135deg, var(--tg-primary) 0%, var(--tg-primary-dark) 100%)",
            color: "white",
            padding: "16px 20px",
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: "-60%",
              right: "-6%",
              width: 220,
              height: 220,
              background: "radial-gradient(circle, var(--tg-accent) 0%, transparent 70%)",
              opacity: 0.25,
              pointerEvents: "none",
            }}
          />
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", position: "relative" }}>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 7,
                fontSize: 10.5,
                fontWeight: 600,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "var(--tg-accent-light)",
              }}
            >
              <SparklesIcon width={13} height={13} />
              {current.group === "Finish" ? "All set" : current.group}
            </span>
            <button
              onClick={close}
              aria-label="Close tour"
              style={{
                background: "rgba(255,255,255,0.12)",
                border: "none",
                borderRadius: 6,
                width: 26,
                height: 26,
                color: "white",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
              }}
            >
              <XIcon width={13} height={13} />
            </button>
          </div>
          <h2 style={{ margin: "10px 0 0", fontSize: 19, fontWeight: 700, letterSpacing: "-0.01em", position: "relative" }}>
            {current.title}
          </h2>
        </div>

        {/* Body */}
        <div style={{ padding: 20 }}>
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 10 }}>
            {current.points.map((p, i) => (
              <li key={i} style={{ display: "flex", gap: 10, fontSize: 13.5, lineHeight: 1.5, color: "var(--text)" }}>
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: "var(--tg-accent)",
                    marginTop: 7,
                    flexShrink: 0,
                  }}
                />
                <span>{p}</span>
              </li>
            ))}
          </ul>

          {current.href && current.cta && (
            <button
              onClick={goToPage}
              style={{
                marginTop: 16,
                background: "var(--bg-subtle)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                padding: "8px 13px",
                fontSize: 13,
                fontWeight: 600,
                color: "var(--tg-accent-dark)",
                cursor: "pointer",
              }}
            >
              {current.cta} →
            </button>
          )}
        </div>

        {/* Footer: progress + nav */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "14px 20px",
            borderTop: "1px solid var(--border)",
          }}
        >
          <div style={{ display: "flex", gap: 5 }}>
            {TOUR_STEPS.map((_, i) => (
              <span
                key={i}
                onClick={() => setStep(i)}
                style={{
                  width: i === step ? 18 : 6,
                  height: 6,
                  borderRadius: 999,
                  background: i === step ? "var(--tg-accent)" : "var(--border-strong)",
                  cursor: "pointer",
                  transition: "width 0.15s ease",
                }}
              />
            ))}
          </div>
          <span style={{ fontSize: 11.5, color: "var(--text-subtle)" }}>
            {step + 1} of {total}
          </span>
          <div style={{ flex: 1 }} />
          {step > 0 && (
            <button
              onClick={back}
              style={{
                background: "transparent",
                border: "1px solid var(--border)",
                borderRadius: 7,
                padding: "7px 13px",
                fontSize: 13,
                fontWeight: 500,
                color: "var(--text-muted)",
                cursor: "pointer",
              }}
            >
              Back
            </button>
          )}
          <button
            onClick={next}
            style={{
              background: "var(--tg-primary)",
              border: "none",
              borderRadius: 7,
              padding: "7px 15px",
              fontSize: 13,
              fontWeight: 600,
              color: "white",
              cursor: "pointer",
            }}
          >
            {atEnd ? "Finish" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}
