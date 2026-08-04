"use client";

import { createContext, useContext } from "react";

/**
 * Which section's help guide is open (by nav href), or null. Provided by
 * AppShell; opened by the "?" buttons in the sidebar, rendered by HelpGuide.
 */
export const HelpContext = createContext<{
  section: string | null;
  open: (key: string) => void;
  close: () => void;
}>({ section: null, open: () => {}, close: () => {} });

export const useHelp = () => useContext(HelpContext);
