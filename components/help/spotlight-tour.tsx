"use client";

/**
 * The interactive spotlight tour — the "Show me on the page" walkthrough.
 *
 * Given a section's `walkthrough` steps (each a CSS selector + copy), it
 * highlights the real element on the screen one step at a time: everything
 * else dims, the target gets a ring, and a tooltip explains it in place. The
 * user clicks Next (or anywhere) to advance, Back to go back, Esc to leave.
 *
 * It lives in AppShell, so it can run over any screen. When a walkthrough is
 * started from the help drawer, the drawer first navigates to the section, so
 * by the time this runs the target elements exist — but navigation/render can
 * lag, so each step POLLS for its element before highlighting, and falls back
 * to a centred card if it never appears.
 */

import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { useHelp } from "./help-context";
import { getGuide, type WalkStep } from "./section-guides";
import { XIcon } from "@/components/ui/icons";

type Box = { top: number; left: number; width: number; height: number };

const RING_PAD = 8;
const TOOLTIP_W = 320;

export function SpotlightTour() {
  const { walkthrough, stopWalkthrough } = useHelp();
  const guide = walkthrough ? getGuide(walkthrough) : undefined;
  const steps: WalkStep[] = guide?.walkthrough ?? [];
  const active = Boolean(guide && steps.length > 0);

  const [step, setStep] = useState(0);
  const [box, setBox] = useState<Box | null>(null);
  const [ready, setReady] = useState(false);

  // Restart at step 0 whenever a walkthrough begins.
  useEffect(() => {
    if (active) {
      setStep(0);
      setBox(null);
      setReady(false);
    }
  }, [walkthrough, active]);

  const total = steps.length;
  const atEnd = step >= total - 1;
  const next = useCallback(() => {
    if (atEnd) stopWalkthrough();
    else setStep((s) => Math.min(s + 1, total - 1));
  }, [atEnd, stopWalkthrough, total]);
  const back = useCallback(() => setStep((s) => Math.max(0, s - 1)), []);

  // Locate the current step's element, polling until it appears, then track it.
  useEffect(() => {
    if (!active) return;
    const selector = steps[step]?.selector;
    if (!selector) return;

    let cancelled = false;
    let tries = 0;
    let timer: ReturnType<typeof setTimeout>;

    const measure = (el: HTMLElement) => {
      const r = el.getBoundingClientRect();
      setBox({ top: r.top, left: r.left, width: r.width, height: r.height });
    };

    const find = () => {
      if (cancelled) return;
      const el = document.querySelector(selector) as HTMLElement | null;
      if (el) {
        setReady(true);
        el.scrollIntoView({ block: "center", behavior: "smooth" });
        // Let the smooth scroll settle, then measure (and once more after).
        measure(el);
        setTimeout(() => !cancelled && measure(el), 260);
        return;
      }
      tries += 1;
      if (tries < 40) timer = setTimeout(find, 100); // up to ~4s
      else {
        setReady(true);
        setBox(null); // give up → centred fallback card
      }
    };
    find();

    const onMove = () => {
      const el = document.querySelector(selector) as HTMLElement | null;
      if (el) measure(el);
    };
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
    };
  }, [active, step, steps]);

  // Keyboard control.
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") stopWalkthrough();
      else if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") back();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, next, back, stopWalkthrough]);

  if (!active || !ready) {
    // While the first element is still being located, dim quietly so the jump
    // to the tour doesn't flash the bare page.
    return active ? <div style={dimStyle} /> : null;
  }

  const current = steps[step];
  const ring = box ? { top: box.top - RING_PAD, left: box.left - RING_PAD, width: box.width + RING_PAD * 2, height: box.height + RING_PAD * 2 } : null;

  // Tooltip placement: below the ring if there's room, else above; clamped to
  // the viewport. No ring (element missing) → centre it.
  const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  let ttTop: number;
  let ttLeft: number;
  if (ring) {
    const below = ring.top + ring.height + 12;
    ttTop = below + 210 < vh ? below : Math.max(12, ring.top - 210);
    ttLeft = Math.min(Math.max(12, ring.left), vw - TOOLTIP_W - 12);
  } else {
    ttTop = vh / 2 - 90;
    ttLeft = vw / 2 - TOOLTIP_W / 2;
  }

  return (
    <>
      {/* Click-catcher: advances on a click anywhere off the tooltip. */}
      <div style={{ position: "fixed", inset: 0, zIndex: 300 }} onClick={next} aria-hidden />

      {/* The spotlight ring dims everything else via a huge box-shadow. */}
      {ring && (
        <div
          style={{
            position: "fixed",
            top: ring.top,
            left: ring.left,
            width: ring.width,
            height: ring.height,
            borderRadius: 12,
            border: "2px solid var(--tg-accent)",
            boxShadow: "0 0 0 9999px rgba(2, 6, 23, 0.55)",
            zIndex: 301,
            pointerEvents: "none",
            transition: "all 0.22s cubic-bezier(0.16, 1, 0.3, 1)",
          }}
        />
      )}
      {!ring && <div style={{ ...dimStyle, zIndex: 301 }} />}

      {/* Tooltip */}
      <div
        role="dialog"
        aria-label={current.title}
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "fixed",
          top: ttTop,
          left: ttLeft,
          width: TOOLTIP_W,
          maxWidth: "92vw",
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 12,
          boxShadow: "var(--shadow-lg)",
          zIndex: 302,
          padding: 16,
          animation: "fadeIn 0.16s ease-out",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <span
            style={{
              fontSize: 10.5,
              fontWeight: 700,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: "var(--tg-accent-dark)",
            }}
          >
            {guide?.title} · {step + 1} of {total}
          </span>
          <button
            onClick={stopWalkthrough}
            aria-label="End walkthrough"
            style={{
              background: "transparent",
              border: "none",
              color: "var(--text-subtle)",
              cursor: "pointer",
              display: "inline-flex",
              padding: 2,
            }}
          >
            <XIcon width={13} height={13} />
          </button>
        </div>

        <div style={{ fontSize: 14.5, fontWeight: 700, color: "var(--text)", marginBottom: 4, letterSpacing: "-0.01em" }}>
          {current.title}
        </div>
        <div style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.55 }}>{current.body}</div>

        {/* Progress dots */}
        <div style={{ display: "flex", gap: 5, margin: "14px 0 12px" }}>
          {steps.map((_, i) => (
            <span
              key={i}
              style={{
                width: i === step ? 18 : 6,
                height: 6,
                borderRadius: 999,
                background: i === step ? "var(--tg-primary)" : "var(--border)",
                transition: "all 0.2s ease",
              }}
            />
          ))}
        </div>

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          {step > 0 && (
            <button
              onClick={back}
              style={{
                background: "transparent",
                border: "1px solid var(--border)",
                borderRadius: 8,
                padding: "7px 12px",
                fontSize: 12.5,
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
              border: "1px solid var(--tg-primary)",
              borderRadius: 8,
              padding: "7px 14px",
              fontSize: 12.5,
              fontWeight: 600,
              color: "white",
              cursor: "pointer",
            }}
          >
            {atEnd ? "Done" : "Next"}
          </button>
        </div>
      </div>
    </>
  );
}

const dimStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(2, 6, 23, 0.55)",
  zIndex: 300,
};
