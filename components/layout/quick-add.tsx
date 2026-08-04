"use client";

/**
 * Global quick-add — a "+" in the topbar, on every page. Create a customer or
 * a task from anywhere, instead of first navigating to the right screen.
 *
 * Reuses the real AddCustomer / AddTask modals in controlled mode, so there's
 * one implementation of each form. The task modal needs a customer list to
 * link against, which this screen doesn't have server-side, so it fetches a
 * lightweight {id,name} list when opened.
 */

import { useEffect, useRef, useState } from "react";
import { PlusIcon } from "@/components/ui/icons";
import { AddCustomer } from "@/app/customers/add-customer";
import { AddTask } from "@/app/tasks/add-task";

export function QuickAdd() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [custOpen, setCustOpen] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);
  const [customers, setCustomers] = useState<{ id: string; name: string }[]>([]);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onEsc);
    };
  }, [menuOpen]);

  function openTask() {
    setMenuOpen(false);
    setTaskOpen(true);
    // Populate the optional customer picker in the background.
    void fetch("/api/customers/options")
      .then((r) => r.json())
      .then((d) => {
        if (d?.ok && Array.isArray(d.customers)) setCustomers(d.customers);
      })
      .catch(() => {});
  }

  const item: React.CSSProperties = {
    display: "block",
    width: "100%",
    textAlign: "left",
    background: "transparent",
    border: "none",
    padding: "8px 12px",
    fontSize: 13,
    color: "var(--text)",
    cursor: "pointer",
  };

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <button
        aria-label="Quick add"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen((o) => !o)}
        style={{
          background: "var(--tg-primary)",
          border: "1px solid var(--tg-primary)",
          borderRadius: 6,
          width: 32,
          height: 32,
          color: "white",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
        }}
      >
        <PlusIcon width={16} height={16} />
      </button>

      {menuOpen && (
        <div
          role="menu"
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            right: 0,
            minWidth: 168,
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 9,
            boxShadow: "var(--shadow-lg)",
            padding: 4,
            zIndex: 40,
          }}
        >
          <button
            role="menuitem"
            style={item}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => { setMenuOpen(false); setCustOpen(true); }}
          >
            New customer
          </button>
          <button
            role="menuitem"
            style={item}
            onMouseDown={(e) => e.preventDefault()}
            onClick={openTask}
          >
            New task
          </button>
        </div>
      )}

      <AddCustomer open={custOpen} onClose={() => setCustOpen(false)} hideTrigger />
      <AddTask customers={customers} open={taskOpen} onClose={() => setTaskOpen(false)} hideTrigger />
    </div>
  );
}
