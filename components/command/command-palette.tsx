"use client";

/**
 * Quick-find command palette. Opens from the sidebar "Quick find" button or
 * Cmd/Ctrl+P (Cmd/Ctrl+K stays with Luna Ask). Fuzzy-ish search over navigation,
 * customers and trips, with full keyboard control (up/down/enter, esc).
 *
 * Search data comes from /api/search on demand; navigation is static and
 * filtered client-side.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useCommand } from "./command-context";
import {
  HomeIcon,
  InboxIcon,
  UsersIcon,
  PlaneIcon,
  ZapIcon,
  CheckSquareIcon,
  ChartIcon,
  SettingsIcon,
  SearchIcon,
} from "@/components/ui/icons";

const NAV = [
  { label: "Dashboard", href: "/", Icon: HomeIcon },
  { label: "Inbox", href: "/inbox", Icon: InboxIcon },
  { label: "Customers", href: "/customers", Icon: UsersIcon },
  { label: "Trips", href: "/trips", Icon: PlaneIcon },
  { label: "Journeys", href: "/journeys", Icon: ZapIcon },
  { label: "Tasks", href: "/tasks", Icon: CheckSquareIcon },
  { label: "Reports", href: "/reports", Icon: ChartIcon },
  { label: "Settings", href: "/settings", Icon: SettingsIcon },
];

type Customer = { id: string; name: string; sub: string };
type Trip = { id: string; householdId: string; dest: string; sub: string };

type FlatItem = {
  key: string;
  group: string;
  label: string;
  sub?: string;
  Icon: typeof HomeIcon;
  run: () => void;
};

export function CommandPalette() {
  const router = useRouter();
  const { open, setOpen } = useCommand();
  const [query, setQuery] = useState("");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Stable global shortcut: Cmd/Ctrl+P toggles, Esc closes.
  const openRef = useRef(open);
  openRef.current = open;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "p") {
        e.preventDefault();
        setOpen(!openRef.current);
      }
      if (e.key === "Escape" && openRef.current) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setOpen]);

  // Reset and focus on open.
  useEffect(() => {
    if (open) {
      setQuery("");
      setCustomers([]);
      setTrips([]);
      setActive(0);
      const id = setTimeout(() => inputRef.current?.focus(), 20);
      return () => clearTimeout(id);
    }
  }, [open]);

  // Debounced search.
  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (!q) {
      setCustomers([]);
      setTrips([]);
      return;
    }
    const id = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        if (data.ok) {
          setCustomers(data.customers ?? []);
          setTrips(data.trips ?? []);
        }
      } catch {
        /* keep last results */
      }
    }, 180);
    return () => clearTimeout(id);
  }, [query, open]);

  const go = useCallback(
    (href: string) => {
      setOpen(false);
      router.push(href);
    },
    [router, setOpen]
  );

  // Build the flat, ordered item list (navigation, customers, trips).
  const ql = query.trim().toLowerCase();
  const navItems = NAV.filter((n) => !ql || n.label.toLowerCase().includes(ql));

  const flat: FlatItem[] = [
    ...navItems.map((n) => ({
      key: `nav:${n.href}`,
      group: "Navigate",
      label: n.label,
      Icon: n.Icon,
      run: () => go(n.href),
    })),
    ...customers.map((c) => ({
      key: `cust:${c.id}`,
      group: "Customers",
      label: c.name,
      sub: c.sub,
      Icon: UsersIcon,
      run: () => go(`/customers/${c.id}`),
    })),
    ...trips.map((t) => ({
      key: `trip:${t.id}`,
      group: "Trips",
      label: t.dest,
      sub: t.sub,
      Icon: PlaneIcon,
      run: () => go(`/customers/${t.householdId}`),
    })),
  ];

  // Keep the active index in range whenever the list changes.
  useEffect(() => {
    setActive((a) => (flat.length === 0 ? 0 : Math.min(a, flat.length - 1)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flat.length]);

  if (!open) return null;

  const onInputKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(flat.length - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      flat[active]?.run();
    }
  };

  // Group the flat list for rendering while tracking each item's flat index.
  let runningIndex = -1;
  const groups: { name: string; items: { item: FlatItem; index: number }[] }[] = [];
  for (const item of flat) {
    runningIndex++;
    const last = groups[groups.length - 1];
    if (last && last.name === item.group) last.items.push({ item, index: runningIndex });
    else groups.push({ name: item.group, items: [{ item, index: runningIndex }] });
  }

  return (
    <div
      onClick={() => setOpen(false)}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(2, 6, 23, 0.5)",
        zIndex: 80,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        paddingTop: "12vh",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(560px, 92vw)",
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 14,
          boxShadow: "var(--shadow-lg)",
          overflow: "hidden",
        }}
      >
        {/* Input */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "13px 16px",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <SearchIcon width={16} height={16} style={{ color: "var(--text-subtle)" }} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onInputKey}
            placeholder="Search customers, trips and pages…"
            style={{
              flex: 1,
              border: "none",
              outline: "none",
              background: "transparent",
              fontSize: 14.5,
              color: "var(--text)",
            }}
          />
          <kbd
            style={{
              fontSize: 10,
              fontFamily: '"JetBrains Mono", monospace',
              color: "var(--text-subtle)",
              border: "1px solid var(--border)",
              borderRadius: 4,
              padding: "1px 6px",
            }}
          >
            esc
          </kbd>
        </div>

        {/* Results */}
        <div style={{ maxHeight: "52vh", overflowY: "auto", padding: 6 }}>
          {flat.length === 0 ? (
            <div
              style={{
                padding: "28px 16px",
                textAlign: "center",
                fontSize: 13,
                color: "var(--text-subtle)",
              }}
            >
              {query.trim() ? "No matches." : "Type to search, or pick a page."}
            </div>
          ) : (
            groups.map((g) => (
              <div key={g.name} style={{ marginBottom: 4 }}>
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    color: "var(--text-subtle)",
                    padding: "8px 10px 4px",
                  }}
                >
                  {g.name}
                </div>
                {g.items.map(({ item, index }) => {
                  const isActive = index === active;
                  const Icon = item.Icon;
                  return (
                    <button
                      key={item.key}
                      onClick={item.run}
                      onMouseEnter={() => setActive(index)}
                      style={{
                        width: "100%",
                        display: "flex",
                        alignItems: "center",
                        gap: 11,
                        padding: "9px 10px",
                        borderRadius: 8,
                        border: "none",
                        textAlign: "left",
                        background: isActive ? "var(--bg-subtle)" : "transparent",
                        color: "var(--text)",
                      }}
                    >
                      <Icon
                        width={15}
                        height={15}
                        style={{ color: "var(--text-subtle)", flexShrink: 0 }}
                      />
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span
                          style={{
                            fontSize: 13.5,
                            fontWeight: 500,
                            display: "block",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {item.label}
                        </span>
                        {item.sub && (
                          <span
                            style={{
                              fontSize: 11.5,
                              color: "var(--text-muted)",
                              display: "block",
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                          >
                            {item.sub}
                          </span>
                        )}
                      </span>
                      {isActive && (
                        <kbd
                          style={{
                            fontSize: 10,
                            fontFamily: '"JetBrains Mono", monospace',
                            color: "var(--text-subtle)",
                            border: "1px solid var(--border)",
                            borderRadius: 4,
                            padding: "1px 6px",
                          }}
                        >
                          ↵
                        </kbd>
                      )}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
