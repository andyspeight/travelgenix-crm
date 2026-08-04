"use client";

import { ReactNode } from "react";
import { MenuIcon } from "@/components/ui/icons";
import { useSidebar } from "./sidebar-context";
import { QuickAdd } from "./quick-add";

export function Topbar({
  title,
  actions,
}: {
  title: string;
  actions?: ReactNode;
}) {
  const { setOpen } = useSidebar();

  return (
    <header
      style={{
        height: "var(--topbar-h)",
        borderBottom: "1px solid var(--border)",
        background: "var(--surface)",
        padding: "0 28px",
        display: "flex",
        alignItems: "center",
        gap: 16,
        position: "sticky",
        top: 0,
        zIndex: 10,
      }}
    >
      {/* Mobile-only menu button (hidden on desktop via .nav-toggle) */}
      <button
        className="nav-toggle"
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        style={{
          background: "transparent",
          border: "1px solid var(--border)",
          borderRadius: 6,
          width: 32,
          height: 32,
          marginLeft: -8,
          color: "var(--text-muted)",
        }}
      >
        <MenuIcon width={16} height={16} />
      </button>

      <div style={{ fontSize: 16, fontWeight: 600, letterSpacing: "-0.01em" }}>
        {title}
      </div>
      <div style={{ flex: 1 }} />
      {actions}
      <QuickAdd />
    </header>
  );
}
