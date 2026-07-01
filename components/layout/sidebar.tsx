"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "./theme-provider";
import { useSidebar } from "./sidebar-context";
import { useCommand } from "@/components/command/command-context";
import { useTour } from "@/components/tour/tour-context";
import {
  HomeIcon,
  InboxIcon,
  UsersIcon,
  PlaneIcon,
  ChartIcon,
  SettingsIcon,
  SearchIcon,
  SunIcon,
  MoonIcon,
  ZapIcon,
  CheckSquareIcon,
  HelpIcon,
} from "@/components/ui/icons";

const navItems = [
  { href: "/", label: "Dashboard", icon: HomeIcon, match: (p: string) => p === "/" },
  { href: "/inbox", label: "Inbox", icon: InboxIcon, match: (p: string) => p.startsWith("/inbox") },
  { href: "/customers", label: "Customers", icon: UsersIcon, match: (p: string) => p.startsWith("/customers") },
  { href: "/trips", label: "Trips", icon: PlaneIcon, match: (p: string) => p.startsWith("/trips") },
  { href: "/journeys", label: "Journeys", icon: ZapIcon, match: (p: string) => p.startsWith("/journeys") },
  { href: "/tasks", label: "Tasks", icon: CheckSquareIcon, match: (p: string) => p.startsWith("/tasks") },
  { href: "/reports", label: "Reports", icon: ChartIcon, match: (p: string) => p.startsWith("/reports") },
];

export function Sidebar() {
  const pathname = usePathname();
  const { theme, toggleTheme } = useTheme();
  const { open, setOpen } = useSidebar();
  const { setOpen: setCommandOpen } = useCommand();
  const { setOpen: setTourOpen } = useTour();

  // Live "needs you today" count for the Inbox badge. Refreshed on navigation
  // so acting on a message updates the number. Hidden at zero or on failure.
  const [inboxBadge, setInboxBadge] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/inbox/badge")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { ok?: boolean; count?: number } | null) => {
        if (!cancelled) setInboxBadge(d?.ok && d.count ? d.count : null);
      })
      .catch(() => {
        if (!cancelled) setInboxBadge(null);
      });
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  return (
    <aside
      className={`app-sidebar${open ? " open" : ""}`}
      style={{
        background: "var(--surface)",
        borderRight: "1px solid var(--border)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Brand */}
      <div
        style={{
          padding: 20,
          display: "flex",
          alignItems: "center",
          gap: 10,
          borderBottom: "1px solid var(--border)",
          height: "var(--topbar-h)",
        }}
      >
        <div
          style={{
            width: 28,
            height: 28,
            background: "linear-gradient(135deg, var(--tg-primary) 0%, var(--tg-accent) 100%)",
            borderRadius: 7,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "white",
            fontWeight: 800,
            fontSize: 13,
            letterSpacing: "-0.02em",
          }}
        >
          L
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: "var(--text)",
              lineHeight: 1.2,
              letterSpacing: "-0.01em",
            }}
          >
            Luna Work
          </div>
          <div
            style={{
              fontSize: 10.5,
              color: "var(--text-subtle)",
              fontWeight: 500,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
            }}
          >
            Travelgenix
          </div>
        </div>
      </div>

      {/* Quick search button */}
      <div style={{ padding: 12, borderBottom: "1px solid var(--border)" }}>
        <button
          style={{
            width: "100%",
            background: "var(--bg-subtle)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            padding: "7px 10px",
            display: "flex",
            alignItems: "center",
            gap: 8,
            color: "var(--text-muted)",
            fontSize: 13,
          }}
          onClick={() => {
            setOpen(false);
            setCommandOpen(true);
          }}
        >
          <SearchIcon width={14} height={14} />
          <span>Quick find…</span>
          <span
            style={{
              marginLeft: "auto",
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 4,
              padding: "1px 6px",
              fontSize: 10,
              color: "var(--text-subtle)",
              fontFamily: '"JetBrains Mono", monospace',
            }}
          >
            ⌘P
          </span>
        </button>
      </div>

      {/* Workspace nav */}
      <div style={{ padding: "12px 8px", borderBottom: "1px solid var(--border)" }}>
        <div
          style={{
            padding: "4px 10px 6px",
            fontSize: 10.5,
            fontWeight: 600,
            color: "var(--text-subtle)",
            letterSpacing: "0.06em",
            textTransform: "uppercase",
          }}
        >
          Workspace
        </div>
        {navItems.map(({ href, label, icon: Icon, match }) => {
          const active = match(pathname || "/");
          const badge = href === "/inbox" ? inboxBadge : null;
          return (
            <Link
              key={href}
              href={href}
              onClick={() => setOpen(false)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "7px 10px",
                borderRadius: 6,
                color: active ? "var(--tg-primary)" : "var(--text-muted)",
                fontSize: 13.5,
                fontWeight: active ? 600 : 500,
                background: active
                  ? "linear-gradient(135deg, rgba(0, 180, 216, 0.08) 0%, rgba(27, 43, 91, 0.04) 100%)"
                  : "transparent",
                textDecoration: "none",
                transition: "all 0.12s ease",
              }}
              data-active={active}
            >
              <Icon width={16} height={16} style={{ flexShrink: 0 }} />
              <span>{label}</span>
              {badge != null && (
                <span
                  style={{
                    marginLeft: "auto",
                    background: "var(--tg-accent)",
                    color: "white",
                    fontSize: 10.5,
                    fontWeight: 600,
                    padding: "1px 6px",
                    borderRadius: 999,
                    lineHeight: 1.5,
                  }}
                >
                  {badge}
                </span>
              )}
            </Link>
          );
        })}
      </div>

      <div style={{ flex: 1 }} />

      {/* Help + Settings */}
      <div style={{ padding: "12px 8px", borderTop: "1px solid var(--border)" }}>
        <button
          onClick={() => { setTourOpen(true); setOpen(false); }}
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "7px 10px",
            borderRadius: 6,
            background: "transparent",
            border: "none",
            color: "var(--text-muted)",
            fontSize: 13.5,
            fontWeight: 500,
            cursor: "pointer",
            textAlign: "left",
          }}
        >
          <HelpIcon width={16} height={16} />
          <span>Take a tour</span>
        </button>
        <Link
          href="/settings"
          onClick={() => setOpen(false)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "7px 10px",
            borderRadius: 6,
            color: pathname?.startsWith("/settings") ? "var(--tg-primary)" : "var(--text-muted)",
            fontSize: 13.5,
            fontWeight: 500,
            textDecoration: "none",
          }}
        >
          <SettingsIcon width={16} height={16} />
          <span>Settings</span>
        </Link>
      </div>

      {/* User + theme toggle */}
      <div
        style={{
          borderTop: "1px solid var(--border)",
          padding: 12,
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            background: "linear-gradient(135deg, #FFB8B8, #FF8E8E)",
            color: "white",
            fontWeight: 600,
            fontSize: 12,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          AS
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: "var(--text)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            Andy Speight
          </div>
          <div style={{ fontSize: 11, color: "var(--text-subtle)" }}>
            Travelgenix · Admin
          </div>
        </div>
        <button
          onClick={toggleTheme}
          aria-label="Toggle theme"
          title="Toggle theme"
          style={{
            background: "transparent",
            border: "1px solid var(--border)",
            borderRadius: 6,
            width: 28,
            height: 28,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--text-muted)",
          }}
        >
          {theme === "dark" ? <SunIcon width={14} height={14} /> : <MoonIcon width={14} height={14} />}
        </button>
      </div>
    </aside>
  );
}
