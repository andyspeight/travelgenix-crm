"use client";

import { createContext, useContext } from "react";

/**
 * Shared open/close state for the mobile sidebar drawer. Provided by AppShell,
 * read by the Sidebar (to apply the drawer class and close on navigation) and
 * the Topbar (whose hamburger opens it). On desktop the sidebar is static and
 * this state is simply unused.
 */
export const SidebarContext = createContext<{
  open: boolean;
  setOpen: (v: boolean) => void;
}>({ open: false, setOpen: () => {} });

export const useSidebar = () => useContext(SidebarContext);
