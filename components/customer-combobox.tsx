"use client";

/**
 * A type-to-filter customer picker. A plain <select> is unusable once an
 * agency has hundreds of customers; this lets you start typing a name and the
 * list narrows to matches, then you pick one (or clear it).
 *
 * Controlled: the parent owns the selected household id. Filtering is
 * client-side over the already-loaded list, so it's instant.
 */

import { useEffect, useMemo, useRef, useState } from "react";

export type CustomerOption = { id: string; name: string };

const MAX_SHOWN = 8;

export function CustomerCombobox({
  customers,
  value,
  onChange,
  inputStyle,
  placeholder = "Search customers…",
}: {
  customers: CustomerOption[];
  value: string;
  onChange: (id: string) => void;
  inputStyle?: React.CSSProperties;
  placeholder?: string;
}) {
  const selectedName = useMemo(() => customers.find((c) => c.id === value)?.name ?? "", [customers, value]);
  const [query, setQuery] = useState(selectedName);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Keep the box showing the selected name when the selection changes elsewhere
  // or the dropdown is closed.
  useEffect(() => {
    if (!open) setQuery(selectedName);
  }, [selectedName, open]);

  // Outside click / Escape closes and reverts the text to the real selection.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery(selectedName);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open, selectedName]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    // While the box still shows the selected name (not actively filtering),
    // show the whole list; otherwise narrow to what was typed.
    const list = !q || q === selectedName.toLowerCase() ? customers : customers.filter((c) => c.name.toLowerCase().includes(q));
    return list.slice(0, MAX_SHOWN);
  }, [customers, query, selectedName]);

  const base: React.CSSProperties = {
    width: "100%",
    border: "1px solid var(--border)",
    borderRadius: 7,
    background: "var(--surface)",
    color: "var(--text)",
    padding: "8px 10px",
    fontSize: 13,
    fontFamily: "inherit",
    ...inputStyle,
  };

  function pick(id: string, name: string) {
    onChange(id);
    setQuery(name);
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(a + 1, matches.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      if (open && matches[active]) {
        e.preventDefault();
        pick(matches[active].id, matches[active].name);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
      setQuery(selectedName);
    }
  }

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <input
        style={base}
        value={query}
        placeholder={placeholder}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
      />
      {value && !open && (
        <button
          type="button"
          aria-label="Clear customer"
          onClick={() => { onChange(""); setQuery(""); }}
          style={{
            position: "absolute",
            right: 8,
            top: "50%",
            transform: "translateY(-50%)",
            background: "transparent",
            border: "none",
            color: "var(--text-muted)",
            cursor: "pointer",
            fontSize: 15,
            lineHeight: 1,
          }}
        >
          ×
        </button>
      )}

      {open && (
        <div
          role="listbox"
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            right: 0,
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            boxShadow: "var(--shadow-lg)",
            zIndex: 60,
            maxHeight: 240,
            overflowY: "auto",
            padding: 4,
          }}
        >
          <button
            type="button"
            role="option"
            aria-selected={!value}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => pick("", "")}
            style={{ display: "block", width: "100%", textAlign: "left", background: "transparent", border: "none", padding: "7px 9px", fontSize: 12.5, color: "var(--text-subtle)", cursor: "pointer", borderRadius: 6 }}
          >
            — No customer —
          </button>
          {matches.map((c, i) => (
            <button
              key={c.id}
              type="button"
              role="option"
              aria-selected={c.id === value}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setActive(i)}
              onClick={() => pick(c.id, c.name)}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                background: i === active ? "var(--bg-subtle)" : "transparent",
                border: "none",
                padding: "7px 9px",
                fontSize: 13,
                color: "var(--text)",
                cursor: "pointer",
                borderRadius: 6,
              }}
            >
              {c.name}
            </button>
          ))}
          {matches.length === 0 && (
            <div style={{ padding: "7px 9px", fontSize: 12.5, color: "var(--text-subtle)" }}>No matches</div>
          )}
        </div>
      )}
    </div>
  );
}
