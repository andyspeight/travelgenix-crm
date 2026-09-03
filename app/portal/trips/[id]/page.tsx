import type { CSSProperties } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { requirePortalSession } from "@/lib/portal/require";
import { createPortalClient } from "@/lib/portal/client";
import { getBranding, getTrip } from "@/lib/portal/data";
import { getTripAccount } from "@/lib/portal/account";
import {
  componentStatus,
  daysUntil,
  formatAmount,
  formatBytes,
  formatDate,
  formatRange,
  glowFor,
  initials,
  tripStatus,
} from "@/lib/portal/format";
import {
  ArrowLeftIcon,
  CalendarIcon,
  CheckIcon,
  ClockIcon,
  ComponentIcon,
  ExternalIcon,
  FileIcon,
  MailIcon,
  MapPinIcon,
  PlaneIcon,
  UsersIcon,
} from "../../icons";

export const dynamic = "force-dynamic";

export default async function PortalTripPage({ params }: { params: { id: string } }) {
  const session = await requirePortalSession();
  const supabase = createPortalClient();
  const [trip, branding] = await Promise.all([
    getTrip(supabase, session.agencyId, session.householdId, params.id),
    getBranding(supabase, session.agencyId),
  ]);
  if (!trip) notFound();

  // The live account from Travelify (payments, balance, documents), looked
  // up the way the My Booking widget does. Quiet when nothing is linked.
  const h = headers();
  const ip = h.get("x-vercel-forwarded-for") || h.get("x-real-ip");
  const account = await getTripAccount(supabase, session, trip, { ip });
  const today = new Date().toISOString().slice(0, 10);

  const status = tripStatus(trip.stage);
  const days = daysUntil(trip.departDate);
  const dest = trip.destination || "Your trip";

  return (
    <main className="p-main">
      <Link href="/portal" className="p-back">
        <ArrowLeftIcon width={16} height={16} />
        All trips
      </Link>

      <div
        className="p-plate p-plate--hero"
        style={{ "--glow-x": glowFor(dest) } as CSSProperties}
      >
        <div className="p-plate-in">
          <div className="p-plate-top">
            <span className={`p-pill p-pill--${status.badge}`}>
              <i aria-hidden />
              {status.label}
            </span>
            {trip.reference ? <span className="p-plate-ref">{trip.reference}</span> : null}
          </div>
          <h1 className="p-plate-dest">{dest}</h1>
          <div className="p-plate-meta">
            <span>
              <CalendarIcon width={16} height={16} />
              <span className="tnum">
                {formatRange(trip.departDate, trip.returnDate) || "Dates to be confirmed"}
              </span>
            </span>
            {trip.nights ? (
              <span>
                <ClockIcon width={16} height={16} />
                {trip.nights} night{trip.nights === 1 ? "" : "s"}
              </span>
            ) : null}
            {days !== null && days > 0 ? (
              <span>
                <PlaneIcon width={16} height={16} />
                <span className="tnum">Departs in {days} day{days === 1 ? "" : "s"}</span>
              </span>
            ) : null}
          </div>
        </div>
      </div>

      <div className="p-body-grid">
        <section>
          <div className="p-section-h">
            <h2>Itinerary</h2>
            <span>
              {trip.components.length} part{trip.components.length === 1 ? "" : "s"}
            </span>
          </div>

          {trip.components.length === 0 ? (
            <div className="p-empty">
              <div className="p-empty-icon">
                <MapPinIcon width={24} height={24} />
              </div>
              <div>
                <h3>Your itinerary is being put together</h3>
                <p>{branding.agencyName} will add each part here as it&rsquo;s confirmed.</p>
              </div>
            </div>
          ) : (
            <ol className="p-timeline">
              {trip.components.map((c, i) => {
                const st = componentStatus(c.status);
                const when = c.startDate
                  ? c.endDate && c.endDate !== c.startDate
                    ? formatRange(c.startDate, c.endDate)
                    : formatDate(c.startDate)
                  : "";
                return (
                  <li key={c.id} className="p-stop" style={{ "--i": i } as CSSProperties}>
                    <span className="p-stop-node">
                      <ComponentIcon kind={c.kind} width={18} height={18} />
                    </span>
                    <div>
                      <p className="p-stop-title">{c.title}</p>
                      {when ? (
                        <p className="p-stop-when">
                          <CalendarIcon width={14} height={14} />
                          <span className="tnum">{when}</span>
                        </p>
                      ) : null}
                    </div>
                    <span className={`p-status p-status--${st.cls}`}>
                      <i aria-hidden />
                      {st.label}
                    </span>
                  </li>
                );
              })}
            </ol>
          )}

          {account.status === "ok" ? (
            <div className="p-section">
              <div className="p-section-h">
                <h2>Documents</h2>
                <span>{account.documents.length}</span>
              </div>
              {account.documents.length === 0 ? (
                <p className="p-help" style={{ margin: 0 }}>
                  Your documents appear here as {branding.agencyName} issues them.
                </p>
              ) : (
                <div className="p-list">
                  {account.documents.map((d, i) => (
                    <a
                      key={d.url}
                      href={d.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-row"
                      style={{ "--i": i } as CSSProperties}
                    >
                      <span className="p-thumb p-thumb--muted" aria-hidden>
                        <FileIcon width={20} height={20} />
                      </span>
                      <div>
                        <p className="p-row-title">{d.name || "Document"}</p>
                        <p className="p-row-sub tnum">
                          {[d.ext ? d.ext.toUpperCase() : "", formatBytes(d.size), formatDate(d.created)]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      </div>
                      <div className="p-row-end">
                        <span className="p-chip">Open</span>
                        <ExternalIcon width={16} height={16} />
                      </div>
                    </a>
                  ))}
                </div>
              )}
            </div>
          ) : null}
        </section>

        <aside className="p-sticky">
          <div className="p-panel">
            {account.status === "ok" ? (
              <div className="p-panel-sec">
                <p className="p-panel-h">Payments</p>
                {account.balance.outstanding > 0 ? (
                  <>
                    <p className="p-price">{formatAmount(account.balance.outstanding, account.currency)}</p>
                    <p className="p-price-sub">
                      balance remaining · {formatAmount(account.balance.paid, account.currency)} paid of{" "}
                      {formatAmount(account.balance.netTotal, account.currency)}
                    </p>
                    {account.balance.next ? (
                      <p className="p-iconline" style={{ marginTop: 14 }}>
                        <ClockIcon width={16} height={16} />
                        <span className="tnum">
                          {formatAmount(account.balance.next.amount, account.currency)}{" "}
                          {account.balance.next.dueDate === today
                            ? "due now"
                            : account.balance.next.dueDate
                              ? `due ${formatDate(account.balance.next.dueDate)}`
                              : "due next"}
                        </span>
                      </p>
                    ) : null}
                    {account.balance.schedule.length > 1 ? (
                      <ul className="p-schedule">
                        {account.balance.schedule.map((line, i) => (
                          <li key={i}>
                            <span className="tnum">
                              {line.isInitial ? "Due now" : line.dueDate ? formatDate(line.dueDate) : "To be confirmed"}
                            </span>
                            <b className="tnum">{formatAmount(line.amount, account.currency)}</b>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </>
                ) : (
                  <p className="p-iconline p-iconline--ok">
                    <CheckIcon width={16} height={16} />
                    <span className="tnum">
                      Paid in full · {formatAmount(account.balance.netTotal, account.currency)}
                    </span>
                  </p>
                )}
                <p className="p-help" style={{ margin: "12px 0 0" }}>
                  Live from your booking. Payments are arranged with {branding.agencyName}.
                </p>
              </div>
            ) : account.status === "unavailable" ? (
              <div className="p-panel-sec">
                <p className="p-panel-h">Payments</p>
                <p className="p-help" style={{ margin: 0 }}>
                  We couldn&rsquo;t load your payment details just now. Try again shortly, or ask{" "}
                  {branding.agencyName}.
                </p>
              </div>
            ) : null}
            <div className="p-panel-sec">
              <p className="p-panel-h">Travelling party</p>
              {trip.passengers.length > 0 ? (
                <ul className="p-party">
                  {trip.passengers.map((p, i) => (
                    <li key={i} className="p-person">
                      <span className="p-initials" aria-hidden>{initials(p.name)}</span>
                      {p.name}
                      {p.isLead ? <small>Lead</small> : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="p-help" style={{ margin: 0 }}>To be confirmed</p>
              )}
            </div>
            <div className="p-panel-sec">
              <p className="p-panel-h">Your travel agent</p>
              <p className="p-iconline">
                <UsersIcon width={16} height={16} />
                {branding.agencyName}
              </p>
              {branding.contactEmail ? (
                <a className="p-iconline" href={`mailto:${branding.contactEmail}`}>
                  <MailIcon width={16} height={16} />
                  {branding.contactEmail}
                </a>
              ) : null}
            </div>
            {trip.reference ? (
              <div className="p-panel-sec">
                <p className="p-panel-h">Booking reference</p>
                <p className="p-mono" style={{ margin: 0 }}>{trip.reference}</p>
              </div>
            ) : null}
          </div>
        </aside>
      </div>
    </main>
  );
}
