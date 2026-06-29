"use client";

import { createContext, useContext } from "react";

/**
 * Open/close state for the Quick-find command palette. Provided by AppShell,
 * opened by the sidebar "Quick find" button and the global Cmd/Ctrl+P shortcut
 * (Cmd/Ctrl+K stays with Luna Ask).
 */
export const CommandContext = createContext<{
  open: boolean;
  setOpen: (v: boolean) => void;
}>({ open: false, setOpen: () => {} });

export const useCommand = () => useContext(CommandContext);
