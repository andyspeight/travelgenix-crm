import { ReactNode } from "react";

export function Topbar({
  title,
  actions,
}: {
  title: string;
  actions?: ReactNode;
}) {
  return (
    <header
      style={{
        height: "var(--topbar-h)",
        borderBottom: "1px solid var(--border)",
        background: "var(--surface)",
        padding: "0 28px",
        display: "flex",
        alignItems: "center",
        gap: 16,
        position: "sticky",
        top: 0,
        zIndex: 10,
      }}
    >
      <div style={{ fontSize: 16, fontWeight: 600, letterSpacing: "-0.01em" }}>
        {title}
      </div>
      <div style={{ flex: 1 }} />
      {actions}
    </header>
  );
}
