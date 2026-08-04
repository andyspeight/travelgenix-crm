"use client";

import { useState } from "react";
import { Sidebar } from "./sidebar";
import { SidebarContext } from "./sidebar-context";
import { CommandContext } from "@/components/command/command-context";
import { CommandPalette } from "@/components/command/command-palette";
import { TourContext } from "@/components/tour/tour-context";
import { ProductTour } from "@/components/tour/product-tour";
import { ToastProvider } from "@/components/toast/toast";

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
  const [tourOpen, setTourOpen] = useState(false);

  return (
    <SidebarContext.Provider value={{ open, setOpen }}>
      <CommandContext.Provider value={{ open: cmdOpen, setOpen: setCmdOpen }}>
        <TourContext.Provider value={{ open: tourOpen, setOpen: setTourOpen }}>
          <ToastProvider>
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
            <ProductTour />
          </ToastProvider>
        </TourContext.Provider>
      </CommandContext.Provider>
    </SidebarContext.Provider>
  );
}
