"use client";

/**
 * A tiny toast system. The app's success/error feedback was ad-hoc — a flash
 * string here, a silent refresh there. This gives one shared confirmation:
 * useToast().push("Task added") from anywhere, rendered bottom-right and
 * auto-dismissed. The provider lives in the app shell so a toast survives the
 * router.refresh() / navigation that usually follows a save.
 */

import { createContext, useCallback, useContext, useRef, useState } from "react";

type Tone = "success" | "error" | "info";
type Toast = { id: number; message: string; tone: Tone };

const ToastContext = createContext<{ push: (message: string, tone?: Tone) => void }>({ push: () => {} });

export const useToast = () => useContext(ToastContext);

const TONE: Record<Tone, { border: string; dot: string }> = {
  success: { border: "var(--success)", dot: "var(--success)" },
  error: { border: "var(--error)", dot: "var(--error)" },
  info: { border: "var(--tg-accent)", dot: "var(--tg-accent-dark)" },
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(0);

  const push = useCallback((message: string, tone: Tone = "success") => {
    const id = ++idRef.current;
    setToasts((t) => [...t, { id, message, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  }, []);

  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      <div
        style={{
          position: "fixed",
          bottom: 20,
          right: 20,
          zIndex: 2000,
          display: "flex",
          flexDirection: "column",
          gap: 8,
          pointerEvents: "none",
        }}
        aria-live="polite"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderLeft: `3px solid ${TONE[t.tone].border}`,
              borderRadius: 9,
              boxShadow: "var(--shadow-lg)",
              padding: "10px 14px",
              fontSize: 13,
              color: "var(--text)",
              display: "flex",
              alignItems: "center",
              gap: 9,
              minWidth: 200,
              maxWidth: 340,
              animation: "fadeUp 0.16s ease-out",
            }}
          >
            <span style={{ width: 7, height: 7, borderRadius: 999, background: TONE[t.tone].dot, flexShrink: 0 }} />
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
