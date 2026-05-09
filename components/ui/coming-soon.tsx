import { ComponentType, SVGProps } from "react";

export function ComingSoon({
  Icon,
  title,
  description,
  day,
}: {
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
  title: string;
  description: string;
  day: number;
}) {
  return (
    <div style={{ padding: 28, maxWidth: 1400, margin: "0 auto", width: "100%" }}>
      <div
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 14,
          padding: "60px 28px",
          textAlign: "center",
        }}
      >
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 14,
            background: "var(--bg-subtle)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--text-subtle)",
            marginBottom: 16,
          }}
        >
          <Icon width={24} height={24} />
        </div>

        <div
          style={{
            display: "inline-block",
            padding: "3px 10px",
            borderRadius: 999,
            background: "var(--bg-subtle)",
            color: "var(--tg-accent-dark)",
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            border: "1px solid var(--border)",
            marginBottom: 14,
          }}
        >
          Day {day}
        </div>

        <h2
          style={{
            fontSize: 20,
            fontWeight: 700,
            margin: "0 0 6px",
            color: "var(--text)",
            letterSpacing: "-0.01em",
          }}
        >
          {title}
        </h2>
        <p
          style={{
            fontSize: 14,
            color: "var(--text-muted)",
            margin: 0,
            maxWidth: 520,
            marginInline: "auto",
            lineHeight: 1.55,
          }}
        >
          {description}
        </p>
      </div>
    </div>
  );
}
