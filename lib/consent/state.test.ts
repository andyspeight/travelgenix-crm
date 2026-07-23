import { describe, expect, it } from "vitest";
import {
  currentConsent,
  channelState,
  canMarket,
  type ConsentLedgerRow,
} from "@/lib/consent/state";

const row = (over: Partial<ConsentLedgerRow>): ConsentLedgerRow => ({
  contact_id: "c1",
  channel: "email",
  granted: true,
  occurred_at: "2026-01-01T00:00:00.000Z",
  source: "webform",
  ...over,
});

describe("currentConsent", () => {
  it("latest row wins regardless of input order", () => {
    const state = currentConsent([
      row({ granted: false, occurred_at: "2026-06-01T00:00:00.000Z", source: "email_reply" }),
      row({ granted: true, occurred_at: "2026-01-01T00:00:00.000Z" }),
    ]);
    const s = channelState(state, "c1", "email");
    expect(s.state).toBe("refused");
    expect(s.source).toBe("email_reply");
  });

  it("channels are independent", () => {
    const state = currentConsent([
      row({ channel: "email", granted: true }),
      row({ channel: "sms", granted: false }),
    ]);
    expect(channelState(state, "c1", "email").state).toBe("granted");
    expect(channelState(state, "c1", "sms").state).toBe("refused");
    expect(channelState(state, "c1", "whatsapp").state).toBe("unknown");
  });

  it("contacts are independent", () => {
    const state = currentConsent([
      row({ contact_id: "c1", granted: true }),
      row({ contact_id: "c2", granted: false }),
    ]);
    expect(channelState(state, "c1", "email").state).toBe("granted");
    expect(channelState(state, "c2", "email").state).toBe("refused");
  });

  it("ignores unknown channel values from a future schema", () => {
    const state = currentConsent([row({ channel: "carrier_pigeon" })]);
    expect(state.get("c1")).toBeUndefined();
  });
});

describe("canMarket — the send-time gate", () => {
  it("only a positive grant permits marketing", () => {
    const state = currentConsent([
      row({ contact_id: "granted", granted: true }),
      row({ contact_id: "refused", granted: false }),
    ]);
    expect(canMarket(state, "granted", "email")).toBe(true);
    expect(canMarket(state, "refused", "email")).toBe(false);
    // unknown (no ledger entry) is not refusal, but it is not permission
    expect(canMarket(state, "never-recorded", "email")).toBe(false);
  });

  it("a later refusal beats an earlier grant, and vice versa", () => {
    const optedOut = currentConsent([
      row({ occurred_at: "2026-01-01T00:00:00.000Z", granted: true }),
      row({ occurred_at: "2026-02-01T00:00:00.000Z", granted: false }),
    ]);
    expect(canMarket(optedOut, "c1", "email")).toBe(false);

    const reGranted = currentConsent([
      row({ occurred_at: "2026-01-01T00:00:00.000Z", granted: false }),
      row({ occurred_at: "2026-03-01T00:00:00.000Z", granted: true, source: "preference_centre" }),
    ]);
    expect(canMarket(reGranted, "c1", "email")).toBe(true);
  });
});
