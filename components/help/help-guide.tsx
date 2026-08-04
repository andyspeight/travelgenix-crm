"use client";

/**
 * The per-section help guide — a right-hand slide-over opened by the "?" next
 * to a sidebar item. It reads while you work, so it sits beside the screen
 * rather than blocking it in the middle. Content comes from section-guides.ts.
 *
 * Lives in AppShell so it stays mounted across navigation. Esc closes it, and
 * "Take me there" deep-links into the section then closes.
 */

import { useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useHelp } from "./help-context";
import { getGuide } from "./section-guides";
import { HelpIcon, SparklesIcon, CheckIcon, XIcon, ZapIcon } from "@/components/ui/icons";

export function HelpGuide() {
  const { section, close, startWalkthrough } = useHelp();
  const router = useRouter();
  const guide = section ? getGuide(section) : undefined;
  const isOpen = Boolean(guide);

  const onKey = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    },
    [close]
  );

  useEffect(() => {
    if (!isOpen) return;
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onKey]);

  if (!guide) return null;

  const cta = guide.cta ?? { href: guide.key, label: "Take me there" };
  const hasWalkthrough = Boolean(guide.walkthrough && guide.walkthrough.length > 0);

  // Start the interactive spotlight tour: leave the drawer, make sure we're on
  // the section (its elements are what get highlighted), then run it.
  const startWalk = () => {
    const key = guide.key;
    close();
    router.push(key);
    startWalkthrough(key);
  };

  return (
    <>
      {/* Dimmer — deliberately light and unblurred: the guide refers to the
          screen behind it, so you must still be able to read that screen. */}
      <div
        onClick={close}
        aria-hidden
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 210,
          background: "rgba(2, 6, 23, 0.14)",
          animation: "fadeIn 0.16s ease-out",
        }}
      />

      {/* Drawer */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={`How to use ${guide.title}`}
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          zIndex: 211,
          width: "min(440px, 92vw)",
          background: "var(--surface)",
          borderLeft: "1px solid var(--border)",
          boxShadow: "var(--shadow-lg)",
          display: "flex",
          flexDirection: "column",
          animation: "slideInRight 0.22s cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      >
        {/* Header band */}
        <div
          style={{
            background: "linear-gradient(135deg, var(--tg-primary) 0%, var(--tg-primary-dark) 100%)",
            color: "white",
            padding: "18px 20px",
            position: "relative",
            overflow: "hidden",
            flexShrink: 0,
          }}
        >
          <div
            style={{
              position: "absolute",
              top: "-70%",
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
              <HelpIcon width={13} height={13} />
              How to use
            </span>
            <button
              onClick={close}
              aria-label="Close guide"
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
          <h2 style={{ margin: "10px 0 4px", fontSize: 20, fontWeight: 700, letterSpacing: "-0.01em", position: "relative" }}>
            {guide.title}
          </h2>
          <p style={{ margin: 0, fontSize: 13, color: "rgba(255,255,255,0.82)", position: "relative", lineHeight: 1.5 }}>
            {guide.blurb}
          </p>
        </div>

        {/* Scrollable body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px" }}>
          {/* Interactive walkthrough — the star option: highlights each real
              element on the screen, in place. */}
          {hasWalkthrough && (
            <button
              onClick={startWalk}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                marginBottom: 20,
                padding: "11px 14px",
                borderRadius: 10,
                border: "1px solid var(--tg-accent)",
                background: "linear-gradient(135deg, rgba(0,180,216,0.10) 0%, rgba(27,43,91,0.05) 100%)",
                color: "var(--tg-primary)",
                fontSize: 13.5,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              <ZapIcon width={15} height={15} />
              Show me on the page
            </button>
          )}

          {/* Step by step */}
          <SectionLabel>Step by step</SectionLabel>
          <ol style={{ listStyle: "none", margin: "10px 0 0", padding: 0, display: "flex", flexDirection: "column", gap: 14 }}>
            {guide.steps.map((s, i) => (
              <li key={i} style={{ display: "flex", gap: 12 }}>
                <span
                  style={{
                    flexShrink: 0,
                    width: 24,
                    height: 24,
                    borderRadius: 999,
                    background: "linear-gradient(135deg, var(--tg-primary) 0%, var(--tg-accent) 100%)",
                    color: "white",
                    fontSize: 12,
                    fontWeight: 700,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    marginTop: 1,
                  }}
                >
                  {i + 1}
                </span>
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--text)", marginBottom: 3 }}>{s.title}</div>
                  <div style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.55 }}>{s.body}</div>
                </div>
              </li>
            ))}
          </ol>

          {/* Key tips */}
          {guide.tips.length > 0 && (
            <div
              style={{
                marginTop: 22,
                padding: 16,
                borderRadius: 12,
                background: "var(--bg-subtle)",
                border: "1px solid var(--border)",
              }}
            >
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 7,
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: "0.05em",
                  textTransform: "uppercase",
                  color: "var(--tg-accent-dark)",
                  marginBottom: 10,
                }}
              >
                <SparklesIcon width={13} height={13} />
                Key tips
              </div>
              <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 9 }}>
                {guide.tips.map((t, i) => (
                  <li key={i} style={{ display: "flex", gap: 9, fontSize: 12.5, color: "var(--text-muted)", lineHeight: 1.5 }}>
                    <CheckIcon width={14} height={14} style={{ flexShrink: 0, marginTop: 2, color: "var(--tg-accent-dark)" }} />
                    <span>{t}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Footer CTA. The extra bottom space keeps these buttons clear of the
            floating Ask Luna button in the corner. */}
        <div
          style={{
            flexShrink: 0,
            padding: "16px 16px 84px",
            borderTop: "1px solid var(--border)",
            display: "flex",
            gap: 10,
          }}
        >
          <button
            onClick={close}
            style={{
              flex: "0 0 auto",
              background: "transparent",
              border: "1px solid var(--border)",
              borderRadius: 8,
              padding: "9px 14px",
              fontSize: 13,
              fontWeight: 500,
              color: "var(--text-muted)",
              cursor: "pointer",
            }}
          >
            Close
          </button>
          <button
            onClick={() => {
              close();
              router.push(cta.href);
            }}
            style={{
              flex: 1,
              background: "var(--tg-primary)",
              border: "1px solid var(--tg-primary)",
              borderRadius: 8,
              padding: "9px 14px",
              fontSize: 13,
              fontWeight: 600,
              color: "white",
              cursor: "pointer",
            }}
          >
            {cta.label}
          </button>
        </div>
      </aside>
    </>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: "0.05em",
        textTransform: "uppercase",
        color: "var(--text-subtle)",
      }}
    >
      {children}
    </div>
  );
}
