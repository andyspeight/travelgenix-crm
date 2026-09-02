/** Route-level skeleton: matches the dashboard's shape so nothing jumps. */
export default function PortalLoading() {
  return (
    <main className="p-main" aria-busy="true" aria-label="Loading your trips">
      <div className="p-skel p-skel--line" style={{ width: 120 }} />
      <div className="p-skel p-skel--title" style={{ marginTop: 12 }} />
      <div className="p-skel p-skel--line" style={{ width: "48%", marginTop: 14 }} />
      <div className="p-grid-featured" style={{ marginTop: 44 }}>
        <div className="p-skel p-skel--plate" />
        <div className="p-aside">
          <div className="p-skel p-skel--row" />
          <div className="p-skel p-skel--row" />
        </div>
      </div>
    </main>
  );
}
