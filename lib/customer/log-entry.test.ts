import { describe, expect, it } from "vitest";
import { validateLogEntry, logEntryRow, MAX_LOG_BODY } from "@/lib/customer/log-entry";

describe("validateLogEntry", () => {
  it("accepts a note and trims it", () => {
    const r = validateLogEntry({ body: "  Called back, all happy  " });
    expect(r).toEqual({ ok: true, kind: "note", body: "Called back, all happy" });
  });

  it("accepts a call when kind says so", () => {
    const r = validateLogEntry({ kind: "call", body: "Booked the Maldives over the phone" });
    expect(r.ok && r.kind).toBe("call");
  });

  it("defaults an unknown kind to note rather than claiming a call", () => {
    const r = validateLogEntry({ kind: "whatsapp", body: "hi" });
    expect(r.ok && r.kind).toBe("note");
  });

  it("rejects an empty body, with a call-specific message", () => {
    expect(validateLogEntry({ kind: "call", body: "   " })).toEqual({
      ok: false,
      error: "Add a line on what was discussed.",
    });
    expect(validateLogEntry({ body: "" })).toEqual({ ok: false, error: "Note is empty." });
  });

  it("rejects a non-string body", () => {
    expect(validateLogEntry({ body: 42 }).ok).toBe(false);
  });

  it("rejects a body over the limit", () => {
    const r = validateLogEntry({ body: "x".repeat(MAX_LOG_BODY + 1) });
    expect(r.ok).toBe(false);
  });

  it("accepts a body exactly at the limit", () => {
    const r = validateLogEntry({ body: "x".repeat(MAX_LOG_BODY) });
    expect(r.ok).toBe(true);
  });
});

describe("logEntryRow", () => {
  it("maps a call to a phone-channel row the timeline renders as a call", () => {
    expect(logEntryRow("call")).toEqual({ kind: "call", channel: "phone", subject: "Call logged" });
  });

  it("maps a note to a note row", () => {
    expect(logEntryRow("note")).toEqual({ kind: "note", channel: "note", subject: "Note" });
  });
});
