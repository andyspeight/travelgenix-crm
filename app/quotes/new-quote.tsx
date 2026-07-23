"use client";

/**
 * New quote — topbar button + modal on /quotes. Raises a quote against any
 * trip still selling (enquiry or quoted stage). Saving as sent starts the
 * expiry window, emits quote.sent and nudges an enquiry-stage trip to
 * 'quoted' on the board. A second quote on the same trip becomes v2 and
 * supersedes the first — that's how price changes stay countable.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PlusIcon, XIcon } from "@/components/ui/icons";

const field: React.CSSProperties = {
  width: "100%",
  border: "1px solid var(--border)",
  borderRadius: 7,
  background: "var(--surface)",
  color: "var(--text)",
  padding: "7px 10px",
  fontSize: 13,
  fontFamily: "inherit",
};

const label: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: "var(--text-muted)",
  display: "block",
  marginBottom: 3,
};

export function NewQuote({ trips }: { trips: { id: string; label: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [tripId, setTripId] = useState("");
  const [totalPrice, setTotalPrice] = useState("");
  const [deposit, setDeposit] = useState("");
  const [margin, setMargin] = useState("");
  const [expires, setExpires] = useState("");
  const [reference, setReference] = useState("");
  const [options, setOptions] = useState("");
  const [sendNow, setSendNow] = useState(true);

  async function save() {
    setError(null);
    setSaving(true);
    try {
      const res = await fetch("/api/quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trip_id: tripId,
          total_price: totalPrice ? Number(totalPrice) : null,
          deposit: deposit ? Number(deposit) : null,
          expected_margin: margin ? Number(margin) : null,
          expires_at: expires || null,
          reference: reference || null,
          options_summary: options || null,
          send: sendNow,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error || `Failed (${res.status})`);
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save the quote");
    } finally {
      setSaving(false);
    }
  }

  const disabled = saving || !tripId || !totalPrice.trim();

  return (
    <>
      <button
        onClick={() => { setOpen(true); setError(null); }}
        style={{
          background: "var(--tg-primary)",
          border: "1px solid var(--tg-primary)",
          borderRadius: 6,
          padding: "6px 10px",
          color: "white",
          fontSize: 12.5,
          fontWeight: 500,
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          cursor: "pointer",
        }}
      >
        <PlusIcon width={14} height={14} />
        New quote
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="New quote"
          onClick={() => setOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 120,
            background: "rgba(2, 6, 23, 0.5)",
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "center",
            padding: "10vh 16px 16px",
            overflowY: "auto",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 460,
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 14,
              boxShadow: "var(--shadow-lg)",
              padding: 20,
              animation: "fadeUp 0.18s ease-out",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "var(--text)" }}>New quote</h2>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close"
                style={{ background: "transparent", border: "1px solid var(--border)", borderRadius: 6, width: 26, height: 26, color: "var(--text-muted)", display: "inline-flex", alignItems: "center", justifyContent: "center" }}
              >
                <XIcon width={13} height={13} />
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div>
                <span style={label}>Trip *</span>
                <select style={field} value={tripId} onChange={(e) => setTripId(e.target.value)} autoFocus>
                  <option value="">Choose a trip at enquiry or quoted stage…</option>
                  {trips.map((t) => (
                    <option key={t.id} value={t.id}>{t.label}</option>
                  ))}
                </select>
                {trips.length === 0 && (
                  <div style={{ fontSize: 11.5, color: "var(--text-subtle)", marginTop: 4 }}>
                    No trips are at enquiry or quoted stage right now. Convert an enquiry first.
                  </div>
                )}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                <div>
                  <span style={label}>Total price £ *</span>
                  <input style={field} type="number" min={0} value={totalPrice} onChange={(e) => setTotalPrice(e.target.value)} placeholder="4850" />
                </div>
                <div>
                  <span style={label}>Deposit £</span>
                  <input style={field} type="number" min={0} value={deposit} onChange={(e) => setDeposit(e.target.value)} placeholder="500" />
                </div>
                <div>
                  <span style={label}>Margin £</span>
                  <input style={field} type="number" min={0} value={margin} onChange={(e) => setMargin(e.target.value)} placeholder="620" />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <span style={label}>Valid until</span>
                  <input style={field} type="date" value={expires} onChange={(e) => setExpires(e.target.value)} />
                </div>
                <div>
                  <span style={label}>Travelify reference</span>
                  <input style={field} value={reference} onChange={(e) => setReference(e.target.value)} placeholder="TVF-Q-0000" />
                </div>
              </div>

              <div>
                <span style={label}>What&apos;s included / options presented</span>
                <textarea
                  style={{ ...field, resize: "vertical", lineHeight: 1.5 }}
                  rows={3}
                  value={options}
                  onChange={(e) => setOptions(e.target.value)}
                  placeholder="e.g. 7 nights Elounda Bay, half board, sea view upgrade option, BA from Gatwick, private transfers"
                />
              </div>

              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "var(--text)", cursor: "pointer" }}>
                <input type="checkbox" checked={sendNow} onChange={(e) => setSendNow(e.target.checked)} />
                Mark as sent now (starts the expiry window and the tracking story)
              </label>

              {error && <div style={{ fontSize: 12, color: "var(--error)" }}>{error}</div>}

              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
                <button
                  onClick={() => setOpen(false)}
                  style={{ background: "transparent", border: "1px solid var(--border)", borderRadius: 7, padding: "7px 13px", fontSize: 13, color: "var(--text-muted)", cursor: "pointer" }}
                >
                  Cancel
                </button>
                <button
                  onClick={save}
                  disabled={disabled}
                  style={{
                    background: "var(--tg-primary)",
                    border: "none",
                    borderRadius: 7,
                    padding: "7px 15px",
                    fontSize: 13,
                    fontWeight: 600,
                    color: "white",
                    cursor: disabled ? "default" : "pointer",
                    opacity: disabled ? 0.6 : 1,
                  }}
                >
                  {saving ? "Saving…" : sendNow ? "Save & mark sent" : "Save draft"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
