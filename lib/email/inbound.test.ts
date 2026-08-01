import { describe, expect, it } from "vitest";
import {
  parseInbound,
  stripQuoted,
  matchInbound,
  threadKeys,
  countsAsReply,
  plusTag,
  type MatchableContact,
  type MatchableSend,
} from "@/lib/email/inbound";

const SEND_ID = "3f2b1a44-0000-4000-8000-abcdefabcdef";

const headers = (extra = "") =>
  [
    "Received: by mx.sendgrid.net",
    "From: Rachel Whitfield <rachel@example.com>",
    "To: reply+" + SEND_ID + "@reply.crm.travelify.io",
    "Subject: Re: Your Crete quote",
    "Message-Id: <inbound-99@mail.example.com>",
    "In-Reply-To: <sg-abc123@sendgrid.net>",
    extra,
  ]
    .filter(Boolean)
    .join("\n");

const fields = (over: Record<string, string> = {}) => ({
  from: "Rachel Whitfield <rachel@example.com>",
  to: "reply+" + SEND_ID + "@reply.crm.travelify.io",
  subject: "Re: Your Crete quote",
  text: "Yes please, book it.\n\nOn Thu, 31 Jul 2026 at 09:14, Luna Work <hi@x.io> wrote:\n> Here is your quote\n",
  headers: headers(),
  envelope: JSON.stringify({ to: ["reply+" + SEND_ID + "@reply.crm.travelify.io"], from: "rachel@example.com" }),
  ...over,
});

describe("reading what arrived", () => {
  it("pulls the person out of a display-name address", () => {
    const msg = parseInbound(fields());
    expect(msg.fromEmail).toBe("rachel@example.com");
    expect(msg.fromName).toBe("Rachel Whitfield");
  });

  it("prefers the envelope recipient, which is what carries our reply tag", () => {
    const msg = parseInbound(fields({ to: "Bookings <hello@agency.co.uk>" }));
    expect(msg.toEmail).toContain("reply+");
  });

  it("keeps the new words and drops the quoted original", () => {
    expect(parseInbound(fields()).body).toBe("Yes please, book it.");
  });

  it("keeps the whole thing too, so nothing they wrote is lost", () => {
    expect(parseInbound(fields()).rawBody).toMatch(/Here is your quote/);
  });
});

describe("stripping the quote without eating the message", () => {
  it("cuts at an Outlook original-message divider", () => {
    expect(stripQuoted("Sounds good.\n\n-----Original Message-----\nFrom: us")).toBe("Sounds good.");
  });

  it("drops inline quoted lines", () => {
    expect(stripQuoted("Agreed\n> you said this\nthanks")).toBe("Agreed\nthanks");
  });

  it("keeps everything when stripping would leave nothing", () => {
    const only = "> I agree with all of that";
    expect(stripQuoted(only)).toBe(only);
  });
});

describe("an out-of-office is not an answer", () => {
  it("spots the Auto-Submitted header", () => {
    const msg = parseInbound(
      fields({ headers: headers("Auto-Submitted: auto-replied"), subject: "Re: Your Crete quote" })
    );
    expect(msg.isAutoReply).toBe(true);
    expect(countsAsReply(msg)).toBe(false);
  });

  it("spots the subject line when the headers are quiet", () => {
    const msg = parseInbound(fields({ subject: "Out of office: back on Monday", headers: headers() }));
    expect(countsAsReply(msg)).toBe(false);
  });

  it("treats an ordinary reply as an answer", () => {
    expect(countsAsReply(parseInbound(fields()))).toBe(true);
  });
});

describe("what to look up", () => {
  it("reads the send id straight off the reply address", () => {
    expect(plusTag("reply+" + SEND_ID + "@x.io")).toBe(SEND_ID);
    expect(threadKeys(parseInbound(fields())).sendId).toBe(SEND_ID);
  });

  it("ignores a plus tag that is not one of our ids", () => {
    const msg = parseInbound(fields({ envelope: JSON.stringify({ to: ["sales+web@agency.co.uk"] }) }));
    expect(threadKeys(msg).sendId).toBeNull();
  });

  it("offers the thread ids and their local parts as lookup tokens", () => {
    const tokens = threadKeys(parseInbound(fields())).tokens;
    expect(tokens).toContain("sg-abc123@sendgrid.net");
    expect(tokens).toContain("sg-abc123");
  });
});

const send = (over: Partial<MatchableSend> = {}): MatchableSend => ({
  id: SEND_ID,
  agency_id: "agency-1",
  household_id: "hh-1",
  contact_id: "c-1",
  enquiry_id: "enq-1",
  provider_message_id: "sg-abc123",
  ...over,
});

const contact = (over: Partial<MatchableContact> = {}): MatchableContact => ({
  id: "c-1",
  agency_id: "agency-1",
  household_id: "hh-1",
  email: "rachel@example.com",
  ...over,
});

describe("tying a reply back to a send", () => {
  const msg = parseInbound(fields());

  it("uses the reply address first — it is the only exact answer", () => {
    const m = matchInbound(msg, threadKeys(msg), { sends: [send()], contacts: [] });
    expect(m.matchedBy).toBe("thread");
    expect(m.enquiryId).toBe("enq-1");
    expect(m.reason).toMatch(/reply address/);
  });

  it("falls back to the thread headers when there is no tag", () => {
    const plain = parseInbound(fields({ envelope: JSON.stringify({ to: ["hello@agency.co.uk"] }) }));
    const m = matchInbound(plain, threadKeys(plain), { sends: [send()], contacts: [] });
    expect(m.matchedBy).toBe("thread");
    expect(m.reason).toMatch(/headers/);
  });

  it("falls back to the sender's address, and says that is what it did", () => {
    const plain = parseInbound(
      fields({ envelope: JSON.stringify({ to: ["hello@agency.co.uk"] }), headers: "From: rachel@example.com" })
    );
    const m = matchInbound(plain, threadKeys(plain), { sends: [], contacts: [contact()] });
    expect(m.matchedBy).toBe("address");
    expect(m.householdId).toBe("hh-1");
    expect(m.reason).toMatch(/not to a specific message/);
  });

  it("refuses to guess when the address exists in two agencies", () => {
    const plain = parseInbound(fields({ envelope: JSON.stringify({ to: ["hello@agency.co.uk"] }), headers: "From: rachel@example.com" }));
    const m = matchInbound(plain, threadKeys(plain), {
      sends: [],
      contacts: [contact(), contact({ id: "c-9", agency_id: "agency-2", household_id: "hh-9" })],
    });
    expect(m.matchedBy).toBe("none");
    expect(m.reason).toMatch(/more than one agency/);
  });

  it("files to the agency but not the customer when one address spans households", () => {
    const plain = parseInbound(fields({ envelope: JSON.stringify({ to: ["hello@agency.co.uk"] }), headers: "From: rachel@example.com" }));
    const m = matchInbound(plain, threadKeys(plain), {
      sends: [],
      contacts: [contact(), contact({ id: "c-9", household_id: "hh-9" })],
    });
    expect(m.matchedBy).toBe("address");
    expect(m.agencyId).toBe("agency-1");
    expect(m.householdId).toBeNull();
  });

  it("says plainly when it has nothing, rather than filing it somewhere wrong", () => {
    const plain = parseInbound(
      fields({
        envelope: JSON.stringify({ to: ["hello@agency.co.uk"] }),
        headers: "From: stranger@nowhere.com",
        from: "stranger@nowhere.com",
      })
    );
    const m = matchInbound(plain, threadKeys(plain), { sends: [], contacts: [] });
    expect(m.matchedBy).toBe("none");
    expect(m.agencyId).toBeNull();
    expect(m.reason).toMatch(/Nothing links/);
  });
});
