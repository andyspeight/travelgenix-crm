"use client";

/**
 * The prompt line under the greeting.
 *
 * The dashboard answers "what needs me now?". This answers "what do I want to
 * know?" — the other half of opening a CRM in the morning, and until now it
 * was behind a floating button and a keyboard shortcut that nobody discovers
 * on their own.
 *
 * It is a doorway, not an assistant. Typing here opens the SAME Luna panel
 * that the floating button opens, with the same history and the same tools.
 * Building a second question box that answered questions its own way is
 * exactly how two assistants end up disagreeing with each other.
 *
 * The suggestions are static and deliberately dull — the things an agency
 * owner actually asks on a Monday. They are not personalised, because a
 * suggestion generated from data is a small AI call on every page load, and
 * this page is meant to be instant.
 */

import { useState } from "react";
import { useLunaAsk } from "@/components/luna-ask-context";
import { SparklesIcon } from "@/components/ui/icons";

const SUGGESTIONS = [
  "Who's travelling in the next month?",
  "Which customers have gone quiet?",
  "What did we earn last month?",
  "Which quotes are at risk?",
];

export function AskBar() {
  const { ask } = useLunaAsk();
  const [value, setValue] = useState("");

  const submit = (question: string) => {
    const q = question.trim();
    if (!q) {
      // An empty box still opens Luna: an agent who clicks it wants to talk,
      // they just have not decided what about yet.
      ask();
      return;
    }
    ask(q);
    setValue("");
  };

  return (
    <div style={{ marginTop: 16 }}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(value);
        }}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 9,
          border: "1px solid var(--border)",
          borderRadius: 10,
          background: "var(--surface)",
          padding: "9px 12px",
        }}
      >
        <SparklesIcon
          width={14}
          height={14}
          style={{ color: "var(--tg-accent-dark)", flexShrink: 0 }}
          aria-hidden
        />
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Ask Luna about your customers, bookings or numbers…"
          aria-label="Ask Luna"
          style={{
            flex: 1,
            minWidth: 0,
            border: "none",
            outline: "none",
            background: "transparent",
            color: "var(--text)",
            fontSize: 13.5,
            fontFamily: "inherit",
          }}
        />
        <kbd
          style={{
            fontSize: 10.5,
            color: "var(--text-subtle)",
            border: "1px solid var(--border)",
            borderRadius: 5,
            padding: "2px 5px",
            fontFamily: '"JetBrains Mono", monospace',
            flexShrink: 0,
          }}
          title="Cmd or Ctrl + K opens Luna from anywhere"
        >
          ⌘K
        </kbd>
      </form>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => submit(s)}
            style={{
              border: "1px solid var(--border)",
              background: "transparent",
              color: "var(--text-muted)",
              borderRadius: 20,
              padding: "3px 10px",
              fontSize: 11.5,
              fontFamily: "inherit",
              cursor: "pointer",
            }}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
