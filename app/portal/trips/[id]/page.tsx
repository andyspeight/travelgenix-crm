import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePortalSession } from "@/lib/portal/require";
import { createPortalClient } from "@/lib/portal/client";
import { getTrip } from "@/lib/portal/data";
import { formatRange, tripStatus, componentIcon, formatDate } from "@/lib/portal/format";

export const dynamic = "force-dynamic";

export default async function PortalTripPage({ params }: { params: { id: string } }) {
  const session = await requirePortalSession();
  const trip = await getTrip(
    createPortalClient(),
    session.agencyId,
    session.householdId,
    params.id
  );
  if (!trip) notFound();

  const status = tripStatus(trip.stage);

  return (
    <main className="portal-main">
      <Link href="/portal" className="portal-back">← All trips</Link>

      <div className="portal-trip-top" style={{ marginBottom: 4 }}>
        <h1 className="portal-h1" style={{ margin: 0 }}>{trip.destination || "Your trip"}</h1>
        <span className={`portal-badge ${status.badge}`}>{status.label}</span>
      </div>
      <p className="portal-sub">
        {formatRange(trip.departDate, trip.returnDate) || "Dates to be confirmed"}
        {trip.nights ? ` · ${trip.nights} night${trip.nights === 1 ? "" : "s"}` : ""}
        {trip.reference ? ` · Ref ${trip.reference}` : ""}
      </p>

      {trip.passengers.length > 0 ? (
        <>
          <h2 className="portal-section-h">Who&apos;s travelling</h2>
          <div className="portal-party">
            {trip.passengers.map((p, i) => (
              <span key={i} className="portal-chip">
                {p.name}
                {p.isLead ? " · lead" : ""}
              </span>
            ))}
          </div>
        </>
      ) : null}

      <h2 className="portal-section-h">Your itinerary</h2>
      {trip.components.length === 0 ? (
        <div className="portal-card portal-empty" style={{ padding: 24 }}>
          Your itinerary is being finalised — check back soon.
        </div>
      ) : (
        <div className="portal-itin">
          {trip.components.map((c) => {
            const when = c.startDate
              ? c.endDate && c.endDate !== c.startDate
                ? formatRange(c.startDate, c.endDate)
                : formatDate(c.startDate)
              : "";
            return (
              <div key={c.id} className="portal-itin-row">
                <span className="portal-itin-icon" aria-hidden>{componentIcon(c.kind)}</span>
                <div>
                  <p className="portal-itin-title">{c.title}</p>
                  {when ? <p className="portal-itin-when">{when}</p> : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
