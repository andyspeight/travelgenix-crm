"use client";

/**
 * New enquiry — the topbar button on /enquiries and its modal.
 *
 * Two ways in, one review step (the blueprint's rule — the agent reviews
 * extracted information rather than retyping it, and nothing is saved until a
 * human presses Save):
 *
 *   1. Paste with Luna: paste the customer's email / form / call notes, Luna
 *      extracts the structured fields, the form fills in for review.
 *   2. Type it in: the same form, blank.
 *
 * The original wording is kept verbatim on the record either way.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PlusIcon, XIcon, SparklesIcon } from "@/components/ui/icons";

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

const section: React.CSSProperties = {
  borderTop: "1px solid var(--border)",
  paddingTop: 10,
  fontSize: 11,
  fontWeight: 600,
  color: "var(--text-subtle)",
  letterSpacing: "0.05em",
  textTransform: "uppercase",
};

type FormState = {
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  source: string;
  destination: string;
  depart_date: string;
  date_flexibility: string;
  duration_nights: string;
  departure_airport: string;
  adults: string;
  children: string;
  child_ages: string;
  budget: string;
  budget_basis: string;
  holiday_type: string;
  occasion: string;
  must_haves: string;
  deal_breakers: string;
  ai_summary: string;
};

const EMPTY: FormState = {
  contact_name: "",
  contact_email: "",
  contact_phone: "",
  source: "manual",
  destination: "",
  depart_date: "",
  date_flexibility: "",
  duration_nights: "",
  departure_airport: "",
  adults: "",
  children: "",
  child_ages: "",
  budget: "",
  budget_basis: "",
  holiday_type: "",
  occasion: "",
  must_haves: "",
  deal_breakers: "",
  ai_summary: "",
};

export function NewEnquiry() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pasted, setPasted] = useState("");
  const [extracted, setExtracted] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);

  const set = (key: keyof FormState) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => setForm((f) => ({ ...f, [key]: e.target.value }));

  function reset() {
    setForm(EMPTY);
    setPasted("");
    setExtracted(false);
    setError(null);
  }

  async function extract() {
    setError(null);
    setExtracting(true);
    try {
      const res = await fetch("/api/enquiries/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: pasted }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        fields?: Record<string, unknown>;
      };
      if (!res.ok || !data.ok || !data.fields) throw new Error(data.error || `Failed (${res.status})`);

      const f = data.fields;
      const s = (v: unknown) => (typeof v === "string" ? v : "");
      const n = (v: unknown) => (typeof v === "number" ? String(v) : "");
      const a = (v: unknown) => (Array.isArray(v) ? (v as string[]).join(", ") : "");

      setForm({
        contact_name: s(f.contact_name),
        contact_email: s(f.contact_email),
        contact_phone: s(f.contact_phone),
        source: "email",
        destination: s(f.destination),
        depart_date: s(f.depart_date),
        date_flexibility: s(f.date_flexibility),
        duration_nights: n(f.duration_nights),
        departure_airport: s(f.departure_airport),
        adults: n(f.adults),
        children: n(f.children),
        child_ages: s(f.child_ages),
        budget: n(f.budget),
        budget_basis: s(f.budget_basis),
        holiday_type: s(f.holiday_type),
        occasion: s(f.occasion),
        must_haves: a(f.must_haves),
        deal_breakers: a(f.deal_breakers),
        ai_summary: s(f.summary),
      });
      setExtracted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't extract, fill the form in manually");
    } finally {
      setExtracting(false);
    }
  }

  async function save() {
    setError(null);
    setSaving(true);
    try {
      const splitList = (v: string) =>
        v.split(/[,;]/).map((x) => x.trim()).filter(Boolean);

      const res = await fetch("/api/enquiries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contact_name: form.contact_name,
          contact_email: form.contact_email || null,
          contact_phone: form.contact_phone || null,
          source: form.source,
          destination: form.destination || null,
          depart_date: form.depart_date || null,
          date_flexibility: form.date_flexibility || null,
          duration_nights: form.duration_nights ? Number(form.duration_nights) : null,
          departure_airport: form.departure_airport || null,
          adults: form.adults ? Number(form.adults) : null,
          children: form.children ? Number(form.children) : null,
          child_ages: form.child_ages || null,
          budget: form.budget ? Number(form.budget) : null,
          budget_basis: form.budget_basis || null,
          holiday_type: form.holiday_type || null,
          occasion: form.occasion || null,
          must_haves: splitList(form.must_haves),
          deal_breakers: splitList(form.deal_breakers),
          original_wording: pasted || null,
          ai_summary: form.ai_summary || null,
          ai_extracted: extracted,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error || `Failed (${res.status})`);
      setOpen(false);
      reset();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save the enquiry");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button
        onClick={() => { setOpen(true); reset(); }}
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
        New enquiry
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="New enquiry"
          onClick={() => setOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 120,
            background: "rgba(2, 6, 23, 0.5)",
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "center",
            padding: "6vh 16px 16px",
            overflowY: "auto",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 560,
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 14,
              boxShadow: "var(--shadow-lg)",
              padding: 20,
              animation: "fadeUp 0.18s ease-out",
              marginBottom: 24,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "var(--text)" }}>New enquiry</h2>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close"
                style={{ background: "transparent", border: "1px solid var(--border)", borderRadius: 6, width: 26, height: 26, color: "var(--text-muted)", display: "inline-flex", alignItems: "center", justifyContent: "center" }}
              >
                <XIcon width={13} height={13} />
              </button>
            </div>

            {/* Paste-with-Luna strip */}
            <div
              style={{
                background: "var(--bg-subtle)",
                border: "1px solid var(--border)",
                borderRadius: 10,
                padding: 12,
                marginBottom: 14,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                <SparklesIcon width={13} height={13} style={{ color: "var(--tg-accent-dark)" }} />
                <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text)" }}>
                  Paste the customer&apos;s message, Luna fills the form
                </span>
              </div>
              <textarea
                value={pasted}
                onChange={(e) => setPasted(e.target.value)}
                placeholder="Paste the email, web form or call notes here. Their original wording is kept on the record."
                rows={4}
                style={{ ...field, resize: "vertical", fontSize: 12.5, lineHeight: 1.5 }}
              />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
                <span style={{ fontSize: 11, color: "var(--text-subtle)" }}>
                  {extracted ? "Fields filled below. Check them before saving." : "Nothing is saved until you review and press Save."}
                </span>
                <button
                  onClick={extract}
                  disabled={extracting || pasted.trim().length < 20}
                  style={{
                    background: "var(--tg-accent-dark)",
                    border: "none",
                    borderRadius: 7,
                    padding: "6px 12px",
                    fontSize: 12,
                    fontWeight: 600,
                    color: "white",
                    cursor: extracting || pasted.trim().length < 20 ? "default" : "pointer",
                    opacity: extracting || pasted.trim().length < 20 ? 0.55 : 1,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                  }}
                >
                  <SparklesIcon width={11} height={11} />
                  {extracting ? "Reading…" : extracted ? "Read again" : "Read with Luna"}
                </button>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <span style={label}>Contact name *</span>
                  <input style={field} value={form.contact_name} onChange={set("contact_name")} placeholder="e.g. Rachel Whitfield" />
                </div>
                <div>
                  <span style={label}>Source</span>
                  <select style={field} value={form.source} onChange={set("source")}>
                    <option value="manual">Manual</option>
                    <option value="email">Email</option>
                    <option value="phone">Phone</option>
                    <option value="website">Website</option>
                    <option value="walk_in">Walk in</option>
                    <option value="referral">Referral</option>
                    <option value="social">Social</option>
                  </select>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <span style={label}>Email</span>
                  <input style={field} type="email" value={form.contact_email} onChange={set("contact_email")} placeholder="rachel@example.com" />
                </div>
                <div>
                  <span style={label}>Phone</span>
                  <input style={field} value={form.contact_phone} onChange={set("contact_phone")} placeholder="07700 900456" />
                </div>
              </div>

              <div style={section}>The trip they want</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <span style={label}>Destination</span>
                  <input style={field} value={form.destination} onChange={set("destination")} placeholder="e.g. Santorini" />
                </div>
                <div>
                  <span style={label}>Holiday type</span>
                  <input style={field} value={form.holiday_type} onChange={set("holiday_type")} placeholder="beach, city, ski…" />
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                <div>
                  <span style={label}>Departure date</span>
                  <input style={field} type="date" value={form.depart_date} onChange={set("depart_date")} />
                </div>
                <div>
                  <span style={label}>Flexibility</span>
                  <select style={field} value={form.date_flexibility} onChange={set("date_flexibility")}>
                    <option value="">—</option>
                    <option value="fixed">Fixed</option>
                    <option value="flexible">Flexible</option>
                    <option value="very_flexible">Very flexible</option>
                  </select>
                </div>
                <div>
                  <span style={label}>Nights</span>
                  <input style={field} type="number" min={1} value={form.duration_nights} onChange={set("duration_nights")} placeholder="7" />
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                <div>
                  <span style={label}>Adults</span>
                  <input style={field} type="number" min={0} value={form.adults} onChange={set("adults")} placeholder="2" />
                </div>
                <div>
                  <span style={label}>Children</span>
                  <input style={field} type="number" min={0} value={form.children} onChange={set("children")} placeholder="0" />
                </div>
                <div>
                  <span style={label}>Child ages</span>
                  <input style={field} value={form.child_ages} onChange={set("child_ages")} placeholder="e.g. 6 and 9" />
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                <div>
                  <span style={label}>Budget £</span>
                  <input style={field} type="number" min={0} value={form.budget} onChange={set("budget")} placeholder="4500" />
                </div>
                <div>
                  <span style={label}>Budget basis</span>
                  <select style={field} value={form.budget_basis} onChange={set("budget_basis")}>
                    <option value="">—</option>
                    <option value="total">Total</option>
                    <option value="per_person">Per person</option>
                  </select>
                </div>
                <div>
                  <span style={label}>From airport</span>
                  <input style={field} value={form.departure_airport} onChange={set("departure_airport")} placeholder="e.g. Bristol" />
                </div>
              </div>
              <div>
                <span style={label}>Occasion</span>
                <input style={field} value={form.occasion} onChange={set("occasion")} placeholder="e.g. 25th anniversary" />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <span style={label}>Must-haves (comma separated)</span>
                  <input style={field} value={form.must_haves} onChange={set("must_haves")} placeholder="sea view, adults only" />
                </div>
                <div>
                  <span style={label}>Deal-breakers</span>
                  <input style={field} value={form.deal_breakers} onChange={set("deal_breakers")} placeholder="no long transfers" />
                </div>
              </div>
              {form.ai_summary && (
                <div>
                  <span style={label}>Luna&apos;s one-line summary (edit freely)</span>
                  <input style={field} value={form.ai_summary} onChange={set("ai_summary")} />
                </div>
              )}

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
                  disabled={saving || !form.contact_name.trim()}
                  style={{
                    background: "var(--tg-primary)",
                    border: "none",
                    borderRadius: 7,
                    padding: "7px 15px",
                    fontSize: 13,
                    fontWeight: 600,
                    color: "white",
                    cursor: saving || !form.contact_name.trim() ? "default" : "pointer",
                    opacity: saving || !form.contact_name.trim() ? 0.6 : 1,
                  }}
                >
                  {saving ? "Saving…" : "Save enquiry"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
