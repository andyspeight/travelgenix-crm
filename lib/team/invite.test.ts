import { describe, expect, it } from "vitest";
import {
  validateInvite,
  normaliseEmail,
  alreadyMember,
  inviteStatus,
  roleLabel,
  INVITABLE_ROLES,
} from "@/lib/team/invite";

describe("validateInvite", () => {
  it("accepts an email and lower-cases + trims it", () => {
    expect(validateInvite({ email: "  Priya@Agency.CO.UK ", role: "admin" })).toEqual({
      ok: true,
      email: "priya@agency.co.uk",
      role: "admin",
    });
  });

  it("defaults an unknown role to member, the smaller grant", () => {
    expect(validateInvite({ email: "a@b.com", role: "superuser" }).ok && validateInvite({ email: "a@b.com", role: "superuser" }).ok).toBe(true);
    const r = validateInvite({ email: "a@b.com", role: "superuser" });
    expect(r.ok && r.role).toBe("member");
  });

  it("never hands out owner from an invite", () => {
    const r = validateInvite({ email: "a@b.com", role: "owner" });
    expect(r.ok && r.role).toBe("member");
    expect(INVITABLE_ROLES).not.toContain("owner");
  });

  it("rejects an empty or malformed address", () => {
    expect(validateInvite({ email: "" })).toEqual({ ok: false, error: "Enter an email address to invite." });
    expect(validateInvite({ email: "not-an-email" }).ok).toBe(false);
    expect(validateInvite({ email: "two@@at.com" }).ok).toBe(false);
    expect(validateInvite({ email: 42 }).ok).toBe(false);
  });
});

describe("alreadyMember", () => {
  it("matches case-insensitively", () => {
    expect(alreadyMember("Boss@x.com", ["boss@x.com", "other@x.com"])).toBe(true);
    expect(alreadyMember("new@x.com", ["boss@x.com"])).toBe(false);
  });
});

describe("inviteStatus", () => {
  const members = ["owner@x.com"];
  it("reads a pending invite as invited until they appear as a member", () => {
    expect(inviteStatus({ email: "new@x.com", role: "member", status: "pending" }, members)).toBe("invited");
  });
  it("reads it as joined once the address is a member", () => {
    expect(inviteStatus({ email: "owner@x.com", role: "admin", status: "pending" }, members)).toBe("joined");
  });
  it("reads a revoked invite as revoked regardless of membership", () => {
    expect(inviteStatus({ email: "owner@x.com", role: "admin", status: "revoked" }, members)).toBe("revoked");
  });
});

describe("roleLabel + normaliseEmail", () => {
  it("labels roles for people", () => {
    expect(roleLabel("owner")).toBe("Owner");
    expect(roleLabel("admin")).toBe("Admin");
    expect(roleLabel("member")).toBe("Member");
    expect(roleLabel("anything-else")).toBe("Member");
  });
  it("normalises non-strings to empty", () => {
    expect(normaliseEmail(null)).toBe("");
    expect(normaliseEmail("  A@B.com ")).toBe("a@b.com");
  });
});
