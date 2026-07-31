/**
 * /no-access — you are signed in, but not into this.
 *
 * Reached when Control resolves a real person whose session can't be tied to
 * a Luna Work agency: either they haven't been granted the CRM, or their
 * agency hasn't been linked to a workspace here yet.
 *
 * The page shows WHICH Control client they arrived as. That one fact turns a
 * dead end into something fixable in seconds — without it, an admin is left
 * guessing which of several client records to map, which is exactly the
 * position we were in before this page existed.
 */

import { controlIdentity } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function NoAccessPage() {
  const who = await controlIdentity();

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 28,
        background: "var(--bg-subtle)",
      }}
    >
      <div
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 14,
          padding: "32px 30px",
          maxWidth: 520,
          boxShadow: "var(--shadow-sm)",
        }}
      >
        <h1 style={{ fontSize: 19, fontWeight: 700, margin: "0 0 10px", color: "var(--text)" }}>
          You don&apos;t have access to Luna Work yet
        </h1>

        {who ? (
          <>
            <p style={{ fontSize: 13.5, color: "var(--text-muted)", lineHeight: 1.6, margin: "0 0 14px" }}>
              Your Travelgenix sign-in worked. What&apos;s missing is the link between
              your Control account and a workspace here.
            </p>
            <div
              style={{
                background: "var(--bg-subtle)",
                border: "1px solid var(--border)",
                borderRadius: 10,
                padding: "12px 14px",
                marginBottom: 16,
                fontSize: 12.5,
                lineHeight: 1.7,
                color: "var(--text)",
              }}
            >
              <div>
                <span style={{ color: "var(--text-muted)" }}>Signed in as</span>{" "}
                <strong>{who.email || "unknown"}</strong>
              </div>
              <div>
                <span style={{ color: "var(--text-muted)" }}>Working in</span>{" "}
                <strong>{who.clientName || "unnamed client"}</strong>
              </div>
              <div>
                <span style={{ color: "var(--text-muted)" }}>Control client ID</span>{" "}
                <code className="mono" style={{ fontSize: 12 }}>
                  {who.clientRecordId}
                </code>
              </div>
            </div>
            <p style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.6, margin: "0 0 20px" }}>
              Send that client ID to your Travelgenix contact and they can link it
              to your workspace. Nothing is wrong with your sign-in.
            </p>
          </>
        ) : (
          <p style={{ fontSize: 13.5, color: "var(--text-muted)", lineHeight: 1.6, margin: "0 0 20px" }}>
            We couldn&apos;t confirm your Travelgenix sign-in. Try signing in again —
            if this keeps happening, your account may not have been granted the CRM.
          </p>
        )}

        <a
          href="https://widgets.travelify.io/dashboard.html"
          style={{
            display: "inline-block",
            background: "var(--tg-primary)",
            color: "white",
            borderRadius: 8,
            padding: "9px 16px",
            fontSize: 13,
            fontWeight: 600,
            textDecoration: "none",
          }}
        >
          Back to your Travelgenix dashboard
        </a>
      </div>
    </div>
  );
}
