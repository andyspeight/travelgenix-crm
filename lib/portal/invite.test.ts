import { afterEach, describe, expect, it } from "vitest";
import { portalBaseUrl, safeNextPath } from "@/lib/portal/invite";

const KEYS = ["PORTAL_BASE_URL", "CANONICAL_HOST"];
afterEach(() => {
  for (const k of KEYS) delete process.env[k];
});

describe("portalBaseUrl", () => {
  it("uses PORTAL_BASE_URL when it is a proper URL", () => {
    process.env.PORTAL_BASE_URL = "https://crm.travelify.io/";
    expect(portalBaseUrl("https://preview.vercel.app/x")).toBe("https://crm.travelify.io");
  });

  it("repairs a value pasted without a scheme, rather than emitting a link that cannot redirect", () => {
    process.env.PORTAL_BASE_URL = "crm.travelify.io";
    expect(portalBaseUrl()).toBe("https://crm.travelify.io");
  });

  it("survives a value pasted with quotes", () => {
    process.env.PORTAL_BASE_URL = '"https://crm.travelify.io"';
    expect(portalBaseUrl()).toBe("https://crm.travelify.io");
  });

  it("prefers the canonical host over the request's own host", () => {
    process.env.CANONICAL_HOST = "crm.travelify.io";
    // A request that arrived on a preview URL must not produce preview links.
    expect(portalBaseUrl("https://travelgenix-abc123.vercel.app/api/portal/auth")).toBe(
      "https://crm.travelify.io"
    );
  });

  it("falls back to the request origin only when nothing is configured", () => {
    expect(portalBaseUrl("https://crm.travelify.io/api/portal/auth")).toBe("https://crm.travelify.io");
  });

  it("never returns a relative or empty base", () => {
    process.env.PORTAL_BASE_URL = "   ";
    expect(portalBaseUrl()).toMatch(/^https:\/\//);
  });
});

describe("safeNextPath", () => {
  it("accepts portal paths only", () => {
    expect(safeNextPath("/portal")).toBe("/portal");
    expect(safeNextPath("/portal/quotes/1a-2b")).toBe("/portal/quotes/1a-2b");
  });

  it("refuses anything that could leave the portal or the site", () => {
    for (const bad of ["//evil.example", "/portal/../admin", "https://evil.example/portal", "/settings", "/portalx", "", null]) {
      expect(safeNextPath(bad)).toBeNull();
    }
  });
});
