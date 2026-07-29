import { describe, expect, it } from "vitest";
import { sessionFromMe, hasRole, type ControlSession } from "@/lib/auth/control";

const me = (over: Record<string, unknown> = {}) => ({
  ok: true,
  user: { email: "agent@sunshine.co.uk", fullName: "Sam Agent" },
  client: { recordId: "recCLIENT0000001", clientName: "Sunshine Holidays", plan: "Boost" },
  accessibleProducts: [{ slug: "crm", role: "member" }],
  isStaff: false,
  ...over,
});

describe("sessionFromMe — who gets in", () => {
  it("accepts a granted user and carries the client through", () => {
    const s = sessionFromMe(me())!;
    expect(s).not.toBeNull();
    expect(s.clientRecordId).toBe("recCLIENT0000001");
    expect(s.clientName).toBe("Sunshine Holidays");
    expect(s.role).toBe("member");
  });

  it("refuses a user with no grant for this product", () => {
    // Signed in to the suite, but not entitled to Luna Work.
    expect(
      sessionFromMe(me({ accessibleProducts: [{ slug: "luna_marketing", role: "owner" }] }))
    ).toBeNull();
  });

  it("refuses when Control says not ok, or the body is empty", () => {
    expect(sessionFromMe(me({ ok: false }))).toBeNull();
    expect(sessionFromMe(null)).toBeNull();
    expect(sessionFromMe(undefined)).toBeNull();
  });

  it("refuses when no client is resolved — there is nothing to scope data to", () => {
    expect(sessionFromMe(me({ client: null }))).toBeNull();
    // Even for staff: a staff member who hasn't picked an agency gets nothing.
    expect(sessionFromMe(me({ client: null, isStaff: true }))).toBeNull();
  });

  it("lets staff in without an explicit grant, as owner", () => {
    const s = sessionFromMe(me({ accessibleProducts: [], isStaff: true }))!;
    expect(s.isStaff).toBe(true);
    expect(s.role).toBe("owner");
  });

  it("an unknown role degrades to the least privilege, never the most", () => {
    const s = sessionFromMe(me({ accessibleProducts: [{ slug: "crm", role: "superuser" }] }))!;
    expect(s.role).toBe("member");
  });
});

describe("hasRole — ordered, not exact-match", () => {
  const at = (role: ControlSession["role"]): ControlSession => ({
    email: "a@b.c", fullName: "A", clientRecordId: "rec1", clientName: "C",
    plan: "Boost", role, isStaff: false,
  });

  it("a higher role satisfies a lower requirement", () => {
    expect(hasRole(at("owner"), "member")).toBe(true);
    expect(hasRole(at("admin"), "member")).toBe(true);
    expect(hasRole(at("admin"), "admin")).toBe(true);
  });

  it("a lower role never satisfies a higher requirement", () => {
    expect(hasRole(at("member"), "admin")).toBe(false);
    expect(hasRole(at("admin"), "owner")).toBe(false);
  });
});
