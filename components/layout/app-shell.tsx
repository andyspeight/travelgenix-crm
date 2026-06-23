"use client";

import { useState } from "react";
import { Sidebar } from "./sidebar";
import { SidebarContext } from "./sidebar-context";

/**
 * The app frame. Holds the mobile drawer state and renders the sidebar, the
 * main column and the dimming overlay. On desktop the grid shows the sidebar
 * statically; on mobile the sidebar becomes an off-canvas drawer (see the
 * .app-shell / .app-sidebar / .sidebar-overlay rules in globals.css).
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <SidebarContext.Provider value={{ open, setOpen }}>
      <div className="app-shell">
        <Sidebar />
        <main className="app-main">{children}</main>
      </div>
      <div
        className={`sidebar-overlay${open ? " open" : ""}`}
        onClick={() => setOpen(false)}
        aria-hidden
      />
    </SidebarContext.Provider>
  );
}
