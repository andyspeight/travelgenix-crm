import { describe, expect, it } from "vitest";
import {
  normaliseEvents,
  messageIdsToCheck,
  ourEvents,
  MAX_EVENTS,
  type OwnedSend,
} from "@/lib/email/webhook-events";

const send = (over: Partial<OwnedSend> = {}): OwnedSend => ({
  id: "send-1",
  agency_id: "agency-1",
  household_id: "hh-1",
  provider_message_id: "abc123",
  ...over,
});

describe("normaliseEvents — a shared account's firehose", () => {
  it("reads SendGrid's array and Brevo's single object alike", () => {
    const sendgrid = normaliseEvents([
      { event: "bounce", email: "A@Example.com", sg_message_id: "abc123.filter0001" },
    ]);
    const brevo = normaliseEvents({
      event: "hard_bounce",
      email: "a@example.com",
      "message-id": "abc123",
    });
    expect(sendgrid[0].messageId).toBe("abc123"); // routing suffix stripped
    expect(brevo[0].messageId).toBe("abc123");
    expect(sendgrid[0].email).toBe("a@example.com"); // lowercased
    expect(sendgrid[0].reason).toBe("bounce");
  });

  it("keeps only events that should suppress — a full mailbox is not a dead address", () => {
    const events = normaliseEvents([
      { event: "delivered", email: "a@b.c", sg_message_id: "m1" },
      { event: "open", email: "a@b.c", sg_message_id: "m2" },
      { event: "deferred", email: "a@b.c", sg_message_id: "m3" },
      { event: "bounce", email: "a@b.c", sg_message_id: "m4" },
      { event: "spamreport", email: "a@b.c", sg_message_id: "m5" },
      { event: "dropped", email: "a@b.c", sg_message_id: "m6" },
    ]);
    expect(events.map((e) => e.event)).toEqual(["bounce", "spamreport", "dropped"]);
    expect(events.map((e) => e.reason)).toEqual(["bounce", "complaint", "bounce"]);
  });

  it("drops events with no address, and survives junk", () => {
    expect(normaliseEvents([{ event: "bounce" }])).toHaveLength(0);
    expect(normaliseEvents([null, undefined, 42, "nonsense"])).toHaveLength(0);
    expect(normaliseEvents(null)).toHaveLength(0);
  });

  it("bounds how much one delivery can ask us to do", () => {
    const flood = Array.from({ length: MAX_EVENTS + 250 }, (_, i) => ({
      event: "bounce",
      email: `x${i}@b.c`,
      sg_message_id: `m${i}`,
    }));
    expect(normaliseEvents(flood)).toHaveLength(MAX_EVENTS);
  });
});

describe("ourEvents — other tools' mail is not ours to act on", () => {
  it("ignores every event whose send we did not make", () => {
    const events = normaliseEvents([
      { event: "bounce", email: "a@b.c", sg_message_id: "luna-marketing-msg" },
      { event: "bounce", email: "d@e.f", sg_message_id: "contract-loader-msg" },
    ]);
    expect(ourEvents(events, [send()])).toEqual([]);
  });

  it("picks out only ours from a mixed batch, and pairs it with the send", () => {
    const events = normaliseEvents([
      { event: "bounce", email: "other@x.com", sg_message_id: "someone-elses" },
      { event: "bounce", email: "ours@x.com", sg_message_id: "abc123.filter0001" },
      { event: "spamreport", email: "third@x.com", sg_message_id: "also-not-ours" },
    ]);
    const ours = ourEvents(events, [send()]);
    expect(ours).toHaveLength(1);
    expect(ours[0].event.email).toBe("ours@x.com");
    expect(ours[0].send.agency_id).toBe("agency-1");
  });

  it("routes each event to the agency that actually sent it", () => {
    const events = normaliseEvents([
      { event: "bounce", email: "one@x.com", sg_message_id: "m-a" },
      { event: "bounce", email: "two@x.com", sg_message_id: "m-b" },
    ]);
    const ours = ourEvents(events, [
      send({ id: "s-a", agency_id: "agency-A", provider_message_id: "m-a" }),
      send({ id: "s-b", agency_id: "agency-B", provider_message_id: "m-b" }),
    ]);
    expect(ours.map((o) => o.send.agency_id)).toEqual(["agency-A", "agency-B"]);
  });

  it("an event with no message id can never be attributed", () => {
    const events = normaliseEvents([{ event: "bounce", email: "a@b.c" }]);
    expect(ourEvents(events, [send()])).toEqual([]);
  });
});

describe("messageIdsToCheck — one lookup, not one per event", () => {
  it("dedupes and drops nulls so the query stays small", () => {
    const events = normaliseEvents([
      { event: "bounce", email: "a@b.c", sg_message_id: "m1.x" },
      { event: "bounce", email: "a@b.c", sg_message_id: "m1.y" }, // same id
      { event: "bounce", email: "c@d.e", sg_message_id: "m2" },
      { event: "bounce", email: "f@g.h" }, // no id
    ]);
    expect(messageIdsToCheck(events).sort()).toEqual(["m1", "m2"]);
  });
});
