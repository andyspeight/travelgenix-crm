"use client";

import { createContext, useContext } from "react";

/**
 * Help state, shared across the shell:
 *   section     — which section's guide DRAWER is open (by nav href), or null.
 *   walkthrough — which section's interactive SPOTLIGHT tour is running, or null.
 *
 * Provided by AppShell; the sidebar "?" opens the drawer, the drawer's
 * "Show me on the page" button starts the walkthrough, and HelpGuide /
 * SpotlightTour render them.
 */
export const HelpContext = createContext<{
  section: string | null;
  open: (key: string) => void;
  close: () => void;
  walkthrough: string | null;
  startWalkthrough: (key: string) => void;
  stopWalkthrough: () => void;
}>({
  section: null,
  open: () => {},
  close: () => {},
  walkthrough: null,
  startWalkthrough: () => {},
  stopWalkthrough: () => {},
});

export const useHelp = () => useContext(HelpContext);
