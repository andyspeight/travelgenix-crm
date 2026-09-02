import Link from "next/link";
import { requirePortalSession } from "@/lib/portal/require";
import { createPortalClient } from "@/lib/portal/client";
import { getContact, listTrips } from "@/lib/portal/data";
import { formatRange, tripStatus } from "@/lib/portal/format";

export const dynamic = "force-dynamic";

export default async function PortalHome() {
  const session = await requirePortalSession();
  const supabase = createPortalClient();
  const [contact, trips] = await Promise.all([
    getContact(supabase, session.agencyId, session.contactId),
    listTrips(supabase, session.agencyId, session.householdId),
  ]);

  const firstName = contact?.firstName?.trim();

  return (
    <main className="portal-main">
      <h1 className="portal-h1">{firstName ? `Welcome back, ${firstName}` : "Your trips"}</h1>
      <p className="portal-sub">
        Everything we&apos;re arranging for you, in one place.{" "}
        <Link href="/portal/details" className="portal-back" style={{ margin: 0 }}>
          Your details →
        </Link>
      </p>

      {trips.length === 0 ? (
        <div className="portal-card portal-empty">
          You don&apos;t have any trips to view yet. When your booking is confirmed, it&apos;ll
          appear here.
        </div>
      ) : (
        <div className="portal-trips">
          {trips.map((t) => {
            const status = tripStatus(t.stage);
            return (
              <Link key={t.id} href={`/portal/trips/${t.id}`} className="portal-trip">
                <div className="portal-trip-top">
                  <p className="portal-trip-dest">{t.destination || "Your trip"}</p>
                  <span className={`portal-badge ${status.badge}`}>{status.label}</span>
                </div>
                <p className="portal-trip-meta">
                  {formatRange(t.departDate, t.returnDate) || "Dates to be confirmed"}
                  {t.nights ? ` · ${t.nights} night${t.nights === 1 ? "" : "s"}` : ""}
                  {t.occasion ? ` · ${t.occasion}` : ""}
                </p>
                {t.reference ? <p className="portal-trip-ref">Ref {t.reference}</p> : null}
              </Link>
            );
          })}
        </div>
      )}
    </main>
  );
}
