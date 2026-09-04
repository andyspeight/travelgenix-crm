"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertIcon, CheckIcon } from "../icons";

export type EditableDetails = {
  phone: string;
  dietary: string;
  address_line1: string;
  address_line2: string;
  city: string;
  county: string;
  postcode: string;
};

/**
 * The details a traveller may correct themselves: their phone, their dietary
 * needs, and the household address. Everything else on the page is read-only
 * with a plain explanation of why.
 *
 * Saves the whole set in one PATCH, shows what changed, and stays open on an
 * error so nothing typed is lost.
 */
export function DetailsForm({
  initial,
  agencyName,
}: {
  initial: EditableDetails;
  agencyName: string;
}) {
  const router = useRouter();
  const [form, setForm] = useState<EditableDetails>(initial);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  const dirty = (Object.keys(initial) as (keyof EditableDetails)[]).some(
    (k) => form[k].trim() !== initial[k].trim()
  );

  function set(field: keyof EditableDetails, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
    if (state === "saved" || state === "error") setState("idle");
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!dirty) return;
    setState("saving");
    setMessage(null);

    // Send only what actually moved, so an untouched field is never rewritten.
    const patch: Record<string, string> = {};
    for (const k of Object.keys(initial) as (keyof EditableDetails)[]) {
      if (form[k].trim() !== initial[k].trim()) patch[k] = form[k].trim();
    }

    try {
      const res = await fetch("/api/portal/details", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        changed?: string[];
      };
      if (res.ok && data.ok) {
        setState("saved");
        setMessage(
          data.changed?.length
            ? `Saved. ${agencyName} can see your updated ${data.changed.join(" and ")}.`
            : "Saved."
        );
        router.refresh();
        return;
      }
      setState("error");
      setMessage(data.error || "That didn't save. Please try again.");
    } catch {
      setState("error");
      setMessage("We couldn't reach the server. Check your connection and try again.");
    }
  }

  const field = (
    id: keyof EditableDetails,
    label: string,
    props: React.InputHTMLAttributes<HTMLInputElement> = {}
  ) => (
    <div>
      <label className="p-label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className="p-input"
        value={form[id]}
        onChange={(e) => set(id, e.target.value)}
        {...props}
      />
    </div>
  );

  return (
    <form onSubmit={save} className="p-form">
      <div className="p-form-sec">
        <p className="p-panel-h">How we reach you</p>
        {field("phone", "Phone number", {
          type: "tel",
          inputMode: "tel",
          autoComplete: "tel",
          maxLength: 40,
          placeholder: "07700 900123",
        })}
        <div>
          <label className="p-label" htmlFor="dietary">
            Dietary needs and allergies
          </label>
          <textarea
            id="dietary"
            className="p-input p-textarea"
            value={form.dietary}
            maxLength={200}
            placeholder="Coeliac, no shellfish, vegetarian…"
            onChange={(e) => set("dietary", e.target.value)}
          />
          <p className="p-help">
            Shared with hotels and airlines when it matters. Leave blank if there&rsquo;s nothing to
            note.
          </p>
        </div>
      </div>

      <div className="p-form-sec">
        <p className="p-panel-h">Home address</p>
        {field("address_line1", "Address line 1", { autoComplete: "address-line1", maxLength: 120 })}
        {field("address_line2", "Address line 2", { autoComplete: "address-line2", maxLength: 120 })}
        <div className="p-form-row">
          {field("city", "Town or city", { autoComplete: "address-level2", maxLength: 80 })}
          {field("county", "County", { autoComplete: "address-level1", maxLength: 80 })}
        </div>
        {field("postcode", "Postcode", {
          autoComplete: "postal-code",
          maxLength: 12,
          style: { maxWidth: 180, textTransform: "uppercase" },
        })}
        <p className="p-help">This is your household&rsquo;s address, used for documents and post.</p>
      </div>

      {state === "error" && message ? (
        <div className="p-error" role="alert">
          <AlertIcon width={16} height={16} />
          <span>{message}</span>
        </div>
      ) : null}
      {state === "saved" && message ? (
        <div className="p-saved" role="status">
          <CheckIcon width={16} height={16} />
          <span>{message}</span>
        </div>
      ) : null}

      <button className="p-btn" type="submit" disabled={!dirty || state === "saving"}>
        {state === "saving" ? "Saving…" : "Save changes"}
      </button>
    </form>
  );
}
