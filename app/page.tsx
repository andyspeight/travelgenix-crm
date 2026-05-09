import { Topbar } from "@/components/layout/topbar";
import { SparklesIcon, PlusIcon } from "@/components/ui/icons";

export default function DashboardPage() {
  return (
    <>
      <Topbar
        title="Dashboard"
        actions={
          <>
            <button
              style={{
                background: "transparent",
                border: "1px solid var(--border)",
                borderRadius: 6,
                padding: "6px 10px",
                color: "var(--text-muted)",
                fontSize: 12.5,
                fontWeight: 500,
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <PlusIcon width={14} height={14} />
              Quick add
            </button>
            <button
              style={{
                background: "var(--tg-primary)",
                border: "1px solid var(--tg-primary)",
                borderRadius: 6,
                padding: "6px 10px",
                color: "white",
                fontSize: 12.5,
                fontWeight: 500,
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <SparklesIcon width={14} height={14} />
              Ask Luna
            </button>
          </>
        }
      />

      <div style={{ padding: 28, maxWidth: 1400, margin: "0 auto", width: "100%" }}>
        <div style={{ marginBottom: 24 }}>
          <h1
            style={{
              fontSize: 24,
              fontWeight: 700,
              letterSpacing: "-0.02em",
              margin: "0 0 4px",
              color: "var(--text)",
            }}
          >
            Good morning, Andy
          </h1>
          <p style={{ fontSize: 14, color: "var(--text-muted)", margin: 0 }}>
            Foundation in place · seed data and intelligence land in days 2–6
          </p>
        </div>

        <DayOneCard />
      </div>
    </>
  );
}

function DayOneCard() {
  return (
    <div
      style={{
        background: "linear-gradient(135deg, var(--tg-primary) 0%, var(--tg-primary-dark) 100%)",
        borderRadius: 14,
        padding: 28,
        color: "white",
        position: "relative",
        overflow: "hidden",
        boxShadow: "0 20px 40px -20px rgba(27, 43, 91, 0.4)",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: "-50%",
          right: "-10%",
          width: 400,
          height: 400,
          background:
            "radial-gradient(circle, var(--tg-accent) 0%, transparent 70%)",
          opacity: 0.25,
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: "var(--tg-accent-light)",
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          marginBottom: 8,
          position: "relative",
        }}
      >
        Day 1 · Foundation
      </div>
      <h2
        style={{
          fontSize: 24,
          fontWeight: 600,
          margin: "0 0 12px",
          letterSpacing: "-0.02em",
          position: "relative",
        }}
      >
        Travelgenix CRM is live.
      </h2>
      <p
        style={{
          fontSize: 15,
          lineHeight: 1.6,
          opacity: 0.85,
          margin: 0,
          maxWidth: 640,
          position: "relative",
        }}
      >
        Schema deployed · Next.js shell scaffolded · design system wired in ·
        Supabase connected · light and dark themes working · all six routes
        loading. Day 2 begins with seeding realistic households, contacts, and
        trips, plus the customers list view.
      </p>

      <div
        style={{
          display: "flex",
          gap: 8,
          marginTop: 22,
          position: "relative",
          flexWrap: "wrap",
        }}
      >
        {[
          "Next.js 14",
          "Supabase",
          "Tailwind",
          "TypeScript",
          "14 tables",
          "Light/dark",
        ].map((t) => (
          <span
            key={t}
            style={{
              background: "rgba(255, 255, 255, 0.1)",
              border: "1px solid rgba(255, 255, 255, 0.15)",
              color: "white",
              fontSize: 12,
              padding: "5px 11px",
              borderRadius: 999,
              backdropFilter: "blur(10px)",
            }}
          >
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}
