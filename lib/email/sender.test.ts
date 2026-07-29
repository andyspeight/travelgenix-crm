import { describe, expect, it } from "vitest";
import { resolveSender, type AgencySender, type PlatformSender } from "@/lib/email/sender";

const PLATFORM: PlatformSender = { address: "mail@travelgenix.io", name: "Travelgenix" };

const agency = (over: Partial<AgencySender> = {}): AgencySender => ({
  name: "Sunshine Holidays",
  emailFromAddress: "bookings@sunshineholidays.co.uk",
  emailFromName: null,
  emailReplyTo: null,
  emailSenderVerified: false,
  ...over,
});

describe("resolveSender — the customer is the agency's customer", () => {
  it("never puts the platform's name on an agency's email", () => {
    const s = resolveSender(agency(), PLATFORM);
    expect(s.fromName).toBe("Sunshine Holidays");
    expect(s.fromName).not.toBe("Travelgenix");
  });

  it("uses the agency's own address once their domain is authenticated", () => {
    const s = resolveSender(agency({ emailSenderVerified: true }), PLATFORM);
    expect(s.fromEmail).toBe("bookings@sunshineholidays.co.uk");
    expect(s.ownDomain).toBe(true);
  });

  it("refuses to send AS an unverified domain — that is spoofing, and lands in spam", () => {
    const s = resolveSender(agency({ emailSenderVerified: false }), PLATFORM);
    expect(s.fromEmail).toBe(PLATFORM.address);
    expect(s.ownDomain).toBe(false);
    // ...but the traveller still sees the agency, and replies reach them.
    expect(s.fromName).toBe("Sunshine Holidays");
    expect(s.replyTo).toBe("bookings@sunshineholidays.co.uk");
  });

  it("prefers an explicit from-name over the agency's registered name", () => {
    const s = resolveSender(
      agency({ emailFromName: "Sunshine Holidays Reservations" }),
      PLATFORM
    );
    expect(s.fromName).toBe("Sunshine Holidays Reservations");
  });

  it("an explicit reply-to wins over the send address", () => {
    const verified = resolveSender(
      agency({ emailSenderVerified: true, emailReplyTo: "team@sunshineholidays.co.uk" }),
      PLATFORM
    );
    expect(verified.replyTo).toBe("team@sunshineholidays.co.uk");

    const unverified = resolveSender(
      agency({ emailReplyTo: "team@sunshineholidays.co.uk" }),
      PLATFORM
    );
    expect(unverified.replyTo).toBe("team@sunshineholidays.co.uk");
  });

  it("an agency that has configured nothing still sends under its own name", () => {
    const s = resolveSender(
      agency({ emailFromAddress: null, emailFromName: null, emailReplyTo: null }),
      PLATFORM
    );
    expect(s.fromEmail).toBe(PLATFORM.address);
    expect(s.fromName).toBe("Sunshine Holidays");
    expect(s.replyTo).toBeNull();
  });

  it("blank strings are treated as unset, not as a blank sender name", () => {
    const s = resolveSender(
      agency({ emailFromName: "   ", emailFromAddress: "  ", emailReplyTo: "" }),
      PLATFORM
    );
    expect(s.fromName).toBe("Sunshine Holidays");
    expect(s.fromEmail).toBe(PLATFORM.address);
    expect(s.replyTo).toBeNull();
  });

  it("verified but with no address of their own falls back safely", () => {
    const s = resolveSender(
      agency({ emailSenderVerified: true, emailFromAddress: null }),
      PLATFORM
    );
    expect(s.fromEmail).toBe(PLATFORM.address);
    expect(s.ownDomain).toBe(false);
  });
});
