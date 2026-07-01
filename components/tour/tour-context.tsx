"use client";

import { createContext, useContext } from "react";

/**
 * Open/close state for the product tour overlay. Provided by AppShell, opened by
 * the sidebar "Take a tour" button and auto-opened once on a first visit.
 */
export const TourContext = createContext<{
  open: boolean;
  setOpen: (v: boolean) => void;
}>({ open: false, setOpen: () => {} });

export const useTour = () => useContext(TourContext);
