"use client";

import { useState } from "react";
import { Sidebar } from "./sidebar";
import { SidebarContext } from "./sidebar-context";
import { CommandContext } from "@/components/command/command-context";
import { CommandPalette } from "@/components/command/command-palette";

/**
 * The app frame. Holds the mobile drawer state and the command-palette state,
 * and renders the sidebar, the main column, the dimming overlay and the
 * palette. On desktop the grid shows the sidebar statically; on mobile the
 * sidebar becomes an off-canvas drawer (see the .app-shell / .app-sidebar /
 * .sidebar-overlay rules in globals.css).
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);

  return (
    <SidebarContext.Provider value={{ open, setOpen }}>
      <CommandContext.Provider value={{ open: cmdOpen, setOpen: setCmdOpen }}>
        <div className="app-shell">
          <Sidebar />
          <main className="app-main">{children}</main>
        </div>
        <div
          className={`sidebar-overlay${open ? " open" : ""}`}
          onClick={() => setOpen(false)}
          aria-hidden
        />
        <CommandPalette />
      </CommandContext.Provider>
    </SidebarContext.Provider>
  );
}
