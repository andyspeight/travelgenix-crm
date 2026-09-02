"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "./sidebar";
import { SidebarContext } from "./sidebar-context";
import { CommandContext } from "@/components/command/command-context";
import { CommandPalette } from "@/components/command/command-palette";
import { TourContext } from "@/components/tour/tour-context";
import { ProductTour } from "@/components/tour/product-tour";
import { ToastProvider } from "@/components/toast/toast";
import { HelpContext } from "@/components/help/help-context";
import { HelpGuide } from "@/components/help/help-guide";
import { SpotlightTour } from "@/components/help/spotlight-tour";

/**
 * The app frame. Holds the mobile drawer state and the command-palette state,
 * and renders the sidebar, the main column, the dimming overlay and the
 * palette. On desktop the grid shows the sidebar statically; on mobile the
 * sidebar becomes an off-canvas drawer (see the .app-shell / .app-sidebar /
 * .sidebar-overlay rules in globals.css).
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);
  const [helpSection, setHelpSection] = useState<string | null>(null);
  const [walkthrough, setWalkthrough] = useState<string | null>(null);

  // The customer portal is a separate surface for the agency's own customers —
  // no agent sidebar, command palette or Luna. Render it bare; it brings its
  // own layout (app/portal/layout.tsx). Placed AFTER the hooks so hook order is
  // stable when navigating between the app and the portal.
  if (pathname?.startsWith("/portal")) return <>{children}</>;

  return (
    <SidebarContext.Provider value={{ open, setOpen }}>
      <CommandContext.Provider value={{ open: cmdOpen, setOpen: setCmdOpen }}>
        <TourContext.Provider value={{ open: tourOpen, setOpen: setTourOpen }}>
          <HelpContext.Provider
            value={{
              section: helpSection,
              open: setHelpSection,
              close: () => setHelpSection(null),
              walkthrough,
              startWalkthrough: setWalkthrough,
              stopWalkthrough: () => setWalkthrough(null),
            }}
          >
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
              <HelpGuide />
              <SpotlightTour />
            </ToastProvider>
          </HelpContext.Provider>
        </TourContext.Provider>
      </CommandContext.Provider>
    </SidebarContext.Provider>
  );
}
