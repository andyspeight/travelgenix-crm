"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "./theme-provider";
import { useSidebar } from "./sidebar-context";
import { useCommand } from "@/components/command/command-context";
import { useTour } from "@/components/tour/tour-context";
import { useHelp } from "@/components/help/help-context";
import { getGuide } from "@/components/help/section-guides";
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
  MessageIcon,
  NoteIcon,
  LifeBuoyIcon,
  SendIcon,
  CoinIcon,
} from "@/components/ui/icons";

const navItems = [
  { href: "/", label: "Dashboard", icon: HomeIcon, match: (p: string) => p === "/" },
  { href: "/inbox", label: "Inbox", icon: InboxIcon, match: (p: string) => p.startsWith("/inbox") },
  { href: "/enquiries", label: "Enquiries", icon: MessageIcon, match: (p: string) => p.startsWith("/enquiries") },
  { href: "/customers", label: "Customers", icon: UsersIcon, match: (p: string) => p.startsWith("/customers") },
  { href: "/trips", label: "Trips", icon: PlaneIcon, match: (p: string) => p.startsWith("/trips") },
  { href: "/quotes", label: "Quotes", icon: NoteIcon, match: (p: string) => p.startsWith("/quotes") },
  { href: "/service", label: "Service", icon: LifeBuoyIcon, match: (p: string) => p.startsWith("/service") },
  { href: "/sequences", label: "Sequences", icon: SendIcon, match: (p: string) => p.startsWith("/sequences") },
  { href: "/journeys", label: "Journeys", icon: ZapIcon, match: (p: string) => p.startsWith("/journeys") },
  { href: "/tasks", label: "Tasks", icon: CheckSquareIcon, match: (p: string) => p.startsWith("/tasks") },
  { href: "/commission", label: "Commission", icon: CoinIcon, match: (p: string) => p.startsWith("/commission") },
  { href: "/reports", label: "Reports", icon: ChartIcon, match: (p: string) => p.startsWith("/reports") },
];

export function Sidebar() {
  const pathname = usePathname();
  const { theme, toggleTheme } = useTheme();
  const { open, setOpen } = useSidebar();
  const { setOpen: setCommandOpen } = useCommand();
  const { setOpen: setTourOpen } = useTour();
  const { open: openHelp } = useHelp();

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

  // Who is actually signed in — fetched once, so the footer greets the real
  // person rather than a name baked into the build.
  const [me, setMe] = useState<{ name: string; initials: string; role: string | null; agencyName: string | null } | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { ok?: boolean; name?: string; initials?: string; role?: string | null; agencyName?: string | null } | null) => {
        if (!cancelled && d?.ok) {
          setMe({
            name: d.name ?? "Your workspace",
            initials: d.initials ?? "·",
            role: d.role ?? null,
            agencyName: d.agencyName ?? null,
          });
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

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
          const hasGuide = Boolean(getGuide(href));
          return (
            <div key={href} className="nav-row" style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Link
                href={href}
                onClick={() => setOpen(false)}
                style={{
                  flex: 1,
                  minWidth: 0,
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
              </Link>
              {/* Right cluster: the count pill and the help "?" sit side by side
                  with a gap, so they never overlap. */}
              {badge != null && (
                <span
                  style={{
                    flexShrink: 0,
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
              {hasGuide && (
                <button
                  type="button"
                  className="nav-help"
                  onClick={() => { setOpen(false); openHelp(href); }}
                  title={`How to use ${label}`}
                  aria-label={`How to use ${label}`}
                  style={{
                    flexShrink: 0,
                    width: 22,
                    height: 22,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "transparent",
                    border: "none",
                    borderRadius: 6,
                    color: "var(--text-subtle)",
                    cursor: "pointer",
                  }}
                >
                  <HelpIcon width={13} height={13} />
                </button>
              )}
            </div>
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
          {me?.initials ?? "·"}
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
            {me?.name ?? "Your workspace"}
          </div>
          <div style={{ fontSize: 11, color: "var(--text-subtle)" }}>
            {[me?.agencyName, me?.role ? me.role.charAt(0).toUpperCase() + me.role.slice(1) : null]
              .filter(Boolean)
              .join(" · ") || "Signed in"}
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
