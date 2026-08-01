import { describe, expect, it } from "vitest";
import {
  normaliseEngagement,
  foldEngagement,
  describeEngagement,
  type EngagementRow,
} from "@/lib/email/engagement";

const RECEIVED = "2026-08-01T10:00:00.000Z";

const row = (over: Partial<EngagementRow> = {}): EngagementRow => ({
  id: "send-1",
  provider_message_id: "msg-1",
  ...over,
});

describe("reading the provider's firehose", () => {
  it("takes SendGrid's opens and clicks and drops everything else", () => {
    const events = normaliseEngagement(
      [
        { event: "delivered", sg_message_id: "msg-1.filter0001", timestamp: 1_785_000_000 },
        { event: "open", sg_message_id: "msg-1.filter0001", timestamp: 1_785_000_060 },
        { event: "processed", sg_message_id: "msg-1.filter0001" },
        { event: "bounce", sg_message_id: "msg-2.filter0001" },
      ],
      RECEIVED
    );
    expect(events.map((e) => e.kind)).toEqual(["delivered", "opened"]);
    expect(events[0].messageId).toBe("msg-1"); // routing suffix stripped
  });

  it("reads Brevo's names too, so one endpoint serves both", () => {
    const events = normaliseEngagement(
      { event: "unique_opened", "message-id": "brevo-9", date: "2026-08-01 11:30:00" },
      RECEIVED
    );
    expect(events[0].kind).toBe("opened");
    expect(events[0].at.startsWith("2026-08-01T11:30")).toBe(true);
  });

  it("falls back to when we received it rather than losing the event", () => {
    const events = normaliseEngagement([{ event: "click", sg_message_id: "msg-1" }], RECEIVED);
    expect(events[0].at).toBe(RECEIVED);
  });
});

describe("folding events onto the sends they belong to", () => {
  it("ignores events for another tool's send", () => {
    const events = normaliseEngagement(
      [{ event: "open", sg_message_id: "someone-elses", timestamp: 1_785_000_000 }],
      RECEIVED
    );
    expect(foldEngagement(events, [row()])).toEqual([]);
  });

  it("counts repeat opens rather than overwriting the first", () => {
    const events = normaliseEngagement(
      [
        { event: "open", sg_message_id: "msg-1", timestamp: 1_785_000_060 },
        { event: "open", sg_message_id: "msg-1", timestamp: 1_785_000_600 },
      ],
      RECEIVED
    );
    const [update] = foldEngagement(events, [row({ open_count: 3 })]);
    expect(update.patch.open_count).toBe(5);
  });

  it("keeps the earliest first-open even when events arrive out of order", () => {
    const events = normaliseEngagement(
      [
        { event: "open", sg_message_id: "msg-1", timestamp: 1_785_000_600 },
        { event: "open", sg_message_id: "msg-1", timestamp: 1_785_000_060 },
      ],
      RECEIVED
    );
    const [update] = foldEngagement(events, [row()]);
    expect(update.patch.first_opened_at).toBe(new Date(1_785_000_060 * 1000).toISOString());
  });

  it("writes nothing when the batch tells us nothing new", () => {
    const at = new Date(1_785_000_000 * 1000).toISOString();
    const events = normaliseEngagement(
      [{ event: "delivered", sg_message_id: "msg-1", timestamp: 1_785_000_000 }],
      RECEIVED
    );
    expect(foldEngagement(events, [row({ delivered_at: at, last_event_at: at })])).toEqual([]);
  });
});

describe("what we are willing to claim", () => {
  it("never says a bounced email was read", () => {
    const state = describeEngagement(row({ status: "bounced", open_count: 4 }));
    expect(state.strength).toBe("failed");
    expect(state.detail).toMatch(/waiting on nothing/);
  });

  it("puts a reply above every other signal", () => {
    const state = describeEngagement(row({ replied_at: RECEIVED, open_count: 0 }));
    expect(state.strength).toBe("acted");
    expect(state.label).toBe("They replied");
  });

  it("calls a click what it is — evidence of a person", () => {
    const state = describeEngagement(row({ click_count: 1, open_count: 2 }));
    expect(state.strength).toBe("acted");
    expect(state.label).toMatch(/Clicked/);
  });

  it("attaches the caveat to every open, because scanners open email", () => {
    const state = describeEngagement(row({ open_count: 2 }));
    expect(state.strength).toBe("weak");
    expect(state.label).toBe("Opened twice");
    expect(state.detail).toMatch(/Apple Mail|scanners/);
  });

  it("does not dress up a delivery as engagement", () => {
    const state = describeEngagement(row({ delivered_at: RECEIVED }));
    expect(state.strength).toBe("delivered");
    expect(state.detail).toMatch(/can't say/);
  });

  it("admits silence is silence", () => {
    expect(describeEngagement(row()).strength).toBe("quiet");
  });
});
