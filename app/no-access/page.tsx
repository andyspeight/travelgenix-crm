/**
 * /no-access — you are signed in, but not into this.
 *
 * Reached when Control resolves a real person whose session can't be tied to
 * a Luna Work agency: either they haven't been granted the CRM, or their
 * agency hasn't been linked to a workspace here yet. Both are answered
 * honestly, because "nothing loaded" with no explanation is the worst
 * possible version of this.
 */

export const dynamic = "force-dynamic";

export default function NoAccessPage() {
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
          maxWidth: 460,
          boxShadow: "var(--shadow-sm)",
        }}
      >
        <h1 style={{ fontSize: 19, fontWeight: 700, margin: "0 0 10px", color: "var(--text)" }}>
          You don&apos;t have access to Luna Work yet
        </h1>
        <p style={{ fontSize: 13.5, color: "var(--text-muted)", lineHeight: 1.6, margin: "0 0 14px" }}>
          You&apos;re signed in to Travelgenix, but this account either hasn&apos;t been
          granted the CRM or its agency hasn&apos;t been linked to a workspace here.
        </p>
        <p style={{ fontSize: 13.5, color: "var(--text-muted)", lineHeight: 1.6, margin: "0 0 20px" }}>
          Ask your Travelgenix contact to grant the CRM in Control and link your agency.
          Nothing is wrong with your sign-in.
        </p>
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
