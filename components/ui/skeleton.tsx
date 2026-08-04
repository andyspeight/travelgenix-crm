/**
 * Skeleton placeholders for route `loading.tsx` boundaries.
 *
 * WHY THIS EXISTS: every data page is a dynamic Server Component, so a click
 * used to keep the previous page frozen on screen — with no feedback — until
 * the whole server render (session + Supabase round-trips) finished. That felt
 * broken. A `loading.tsx` that renders one of these makes the frame appear
 * instantly: the sidebar stays, the content area shows a shimmer, and the real
 * page streams in when it's ready. It also lets Next prefetch this static shell
 * for the dynamic route, so on a warm link the skeleton shows with no server
 * round-trip at all.
 *
 * Pure server components (no client JS) — a loading state must be cheap.
 */

/** A single shimmering block. `w`/`h` accept any CSS length. */
export function Skeleton({
  w = "100%",
  h = 14,
  radius = 6,
  style,
}: {
  w?: number | string;
  h?: number | string;
  radius?: number;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className="tg-skeleton"
      style={{ width: w, height: h, borderRadius: radius, ...style }}
      aria-hidden
    />
  );
}

/** The sticky page header bar, with the real title shown immediately. */
function HeaderBar({ title }: { title: string }) {
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
      <span style={{ fontSize: 15, fontWeight: 700, color: "var(--text)" }}>{title}</span>
      <div style={{ marginLeft: "auto" }}>
        <Skeleton w={92} h={30} radius={8} />
      </div>
    </header>
  );
}

function ListRows({ rows = 8 }: { rows?: number }) {
  return (
    <div
      style={{
        border: "1px solid var(--border)",
        borderRadius: 10,
        overflow: "hidden",
        background: "var(--surface)",
      }}
    >
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            padding: "14px 16px",
            borderTop: i === 0 ? "none" : "1px solid var(--border)",
          }}
        >
          <Skeleton w={34} h={34} radius={9} />
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 7 }}>
            <Skeleton w={`${40 + ((i * 7) % 35)}%`} h={12} />
            <Skeleton w={`${22 + ((i * 5) % 25)}%`} h={10} />
          </div>
          <Skeleton w={64} h={22} radius={999} />
          <Skeleton w={52} h={12} />
        </div>
      ))}
    </div>
  );
}

function CardGrid({ cards = 6 }: { cards?: number }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
        gap: 16,
      }}
    >
      {Array.from({ length: cards }).map((_, i) => (
        <div
          key={i}
          style={{
            border: "1px solid var(--border)",
            borderRadius: 12,
            padding: 18,
            background: "var(--surface)",
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          <Skeleton w={40} h={40} radius={10} />
          <Skeleton w="70%" h={13} />
          <Skeleton w="45%" h={11} />
          <Skeleton w="100%" h={30} radius={8} style={{ marginTop: 4 }} />
        </div>
      ))}
    </div>
  );
}

/**
 * A whole-page loading frame: header with the real title, then a body that
 * roughly matches the destination (a list, a card grid, or a record).
 */
export function PageSkeleton({
  title,
  variant = "list",
}: {
  title: string;
  variant?: "list" | "cards" | "detail";
}) {
  return (
    <>
      <HeaderBar title={title} />
      <div style={{ padding: 28, display: "flex", flexDirection: "column", gap: 18 }}>
        {variant !== "detail" && (
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <Skeleton w={280} h={36} radius={8} />
            <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
              <Skeleton w={96} h={30} radius={8} />
              <Skeleton w={96} h={30} radius={8} />
            </div>
          </div>
        )}

        {variant === "list" && <ListRows />}
        {variant === "cards" && <CardGrid />}
        {variant === "detail" && (
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 2fr) minmax(0, 1fr)", gap: 18 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
                <Skeleton w={56} h={56} radius={14} />
                <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
                  <Skeleton w="45%" h={16} />
                  <Skeleton w="30%" h={11} />
                </div>
              </div>
              <ListRows rows={5} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <CardGrid cards={2} />
            </div>
          </div>
        )}
      </div>
    </>
  );
}
