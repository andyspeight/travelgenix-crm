import type { CSSProperties } from "react";
import Link from "next/link";
import { requirePortalSession } from "@/lib/portal/require";
import { createPortalClient } from "@/lib/portal/client";
import {
  getBranding,
  getContact,
  listQuotes,
  listTrips,
  type PortalTripSummary,
} from "@/lib/portal/data";
import {
  daysUntil,
  formatMoney,
  formatRange,
  glowFor,
  initials,
  quoteState,
  tripStatus,
} from "@/lib/portal/format";
import {
  ArrowRightIcon,
  CalendarIcon,
  ChevronRightIcon,
  ClockIcon,
  CompassIcon,
  MailIcon,
  TicketIcon,
  MapPinIcon,
  UsersIcon,
} from "./icons";

export const dynamic = "force-dynamic";

const UPCOMING = new Set(["booked", "pre_departure", "travelling"]);

function nightsLabel(n: number | null): string | null {
  if (!n) return null;
  return `${n} night${n === 1 ? "" : "s"}`;
}

export default async function PortalHome() {
  const session = await requirePortalSession();
  const supabase = createPortalClient();
  const [contact, trips, quotes, branding] = await Promise.all([
    getContact(supabase, session.agencyId, session.contactId),
    listTrips(supabase, session.agencyId, session.householdId),
    listQuotes(supabase, session.agencyId, session.householdId),
    getBranding(supabase, session.agencyId),
  ]);

  const firstName = contact?.firstName?.trim();
  const agency = branding.agencyName;

  // Soonest departure first for what's coming; most recent first for the past.
  const upcoming = trips
    .filter((t) => UPCOMING.has(t.stage))
    .sort((a, b) => (a.departDate ?? "9999").localeCompare(b.departDate ?? "9999"));
  const past = trips.filter((t) => t.stage === "returned");
  const featured: PortalTripSummary | undefined = upcoming[0];
  const others = upcoming.slice(1);
  const days = featured ? daysUntil(featured.departDate) : null;

  // Quotes waiting on the customer come first: they are the one thing on
  // this page that needs something FROM the traveller.
  const decisions = quotes.map((q) => ({ ...q, state: quoteState(q) }));
  const openCount = decisions.filter((q) => q.state === "open").length;

  return (
    <main className="p-main">
      <div className="p-hero">
        <div>
          <div className="p-eyebrow">Welcome back</div>
          <h1 className="p-h1">{firstName ? `Hello, ${firstName}` : "Your trips"}</h1>
          <p className="p-lead">
            Everything {agency} is arranging for you, in one place: itineraries, dates and
            who&rsquo;s travelling.
          </p>
        </div>
        {featured && featured.stage === "travelling" ? (
          <div className="p-live">
            <span className="p-dot" aria-hidden />
            You&rsquo;re travelling now
          </div>
        ) : featured && days !== null && days >= 0 ? (
          <div className="p-live">
            <span className="p-dot" aria-hidden />
            <span className="tnum">
              {featured.destination || "Your next trip"} in {days} day{days === 1 ? "" : "s"}
            </span>
          </div>
        ) : openCount > 0 ? (
          <div className="p-live">
            <span className="p-dot" aria-hidden />
            <span className="tnum">
              {openCount} quote{openCount === 1 ? "" : "s"} awaiting your decision
            </span>
          </div>
        ) : null}
      </div>

      {decisions.length > 0 ? (
        <section className="p-section" style={{ marginTop: 0 }}>
          <div className="p-section-h">
            <h2>For your decision</h2>
            <span>{decisions.length}</span>
          </div>
          <div className="p-list">
            {decisions.map((q, i) => {
              const open = q.state === "open";
              const expiresIn = daysUntil(q.expiresAt);
              const price = formatMoney(q.totalPrice, q.currency);
              const when = !open
                ? "Expired"
                : expiresIn !== null && expiresIn >= 0
                  ? `valid ${expiresIn} more day${expiresIn === 1 ? "" : "s"}`
                  : "";
              return (
                <Link
                  key={q.id}
                  href={`/portal/quotes/${q.id}`}
                  prefetch={false}
                  className="p-row"
                  style={{ "--i": i } as CSSProperties}
                >
                  <span className={`p-thumb ${open ? "p-thumb--accent" : "p-thumb--muted"}`} aria-hidden>
                    <TicketIcon width={20} height={20} />
                  </span>
                  <div>
                    <p className="p-row-title">{q.trip.destination || "Your trip"}</p>
                    <p className="p-row-sub tnum">
                      {[
                        `Quote v${q.version}`,
                        price,
                        formatRange(q.trip.departDate, q.trip.returnDate),
                        when,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  <div className="p-row-end">
                    <span className={`p-chip ${open ? "p-chip--decide" : "p-chip--expired"}`}>
                      {open ? "Decide" : "Expired"}
                    </span>
                    <ChevronRightIcon width={18} height={18} />
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      ) : null}

      {trips.length === 0 && decisions.length === 0 ? (
        <div className="p-empty">
          <div className="p-empty-icon">
            <CompassIcon width={24} height={24} />
          </div>
          <div>
            <h3>Nothing booked yet</h3>
            <p>
              When {agency} confirms your next trip, it appears here with its itinerary, dates and
              travelling party.
            </p>
          </div>
        </div>
      ) : null}

      {featured ? (
        <section className="p-section" style={decisions.length ? undefined : { marginTop: 0 }}>
          <div className="p-section-h">
            <h2>Coming up</h2>
            <span>{upcoming.length} trip{upcoming.length === 1 ? "" : "s"}</span>
          </div>
          <div className="p-grid-featured">
            <Link
              href={`/portal/trips/${featured.id}`}
              className="p-plate p-plate--featured"
              style={{ "--glow-x": glowFor(featured.destination ?? featured.id) } as CSSProperties}
            >
              <div className="p-plate-in">
                <div className="p-plate-top">
                  <span className={`p-pill p-pill--${tripStatus(featured.stage).badge}`}>
                    <i aria-hidden />
                    {tripStatus(featured.stage).label}
                  </span>
                  {featured.reference ? <span className="p-plate-ref">{featured.reference}</span> : null}
                </div>
                <div className="p-plate-dest">{featured.destination || "Your next trip"}</div>
                <div className="p-plate-meta">
                  <span>
                    <CalendarIcon width={16} height={16} />
                    <span className="tnum">
                      {formatRange(featured.departDate, featured.returnDate) || "Dates to be confirmed"}
                    </span>
                  </span>
                  {nightsLabel(featured.nights) ? (
                    <span>
                      <ClockIcon width={16} height={16} />
                      {nightsLabel(featured.nights)}
                    </span>
                  ) : null}
                  {featured.occasion ? (
                    <span>
                      <MapPinIcon width={16} height={16} />
                      {featured.occasion}
                    </span>
                  ) : null}
                </div>
                <span className="p-plate-cta" aria-hidden>
                  <ArrowRightIcon width={18} height={18} />
                </span>
              </div>
            </Link>

            <div className="p-aside">
              {others.length > 0 ? (
                <div className="p-panel">
                  <div className="p-panel-sec">
                    <p className="p-panel-h">Also coming up</p>
                    <div className="p-list">
                      {others.map((t, i) => (
                        <Link
                          key={t.id}
                          href={`/portal/trips/${t.id}`}
                          className="p-row"
                          style={{ "--i": i } as CSSProperties}
                        >
                          <span className="p-thumb" aria-hidden>{initials(t.destination || "Trip")}</span>
                          <div>
                            <p className="p-row-title">{t.destination || "Your trip"}</p>
                            <p className="p-row-sub tnum">
                              {formatRange(t.departDate, t.returnDate) || "Dates to be confirmed"}
                            </p>
                          </div>
                          <div className="p-row-end">
                            <ChevronRightIcon width={18} height={18} />
                          </div>
                        </Link>
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="p-panel">
                <div className="p-panel-sec">
                  <p className="p-panel-h">Your travel agent</p>
                  <p className="p-iconline">
                    <UsersIcon width={16} height={16} />
                    {agency}
                  </p>
                  {branding.contactEmail ? (
                    <a className="p-iconline" href={`mailto:${branding.contactEmail}`}>
                      <MailIcon width={16} height={16} />
                      {branding.contactEmail}
                    </a>
                  ) : null}
                </div>
                <div className="p-panel-sec">
                  <p className="p-panel-h">Your details</p>
                  <Link className="p-link" href="/portal/details">
                    View what we hold for you
                    <ArrowRightIcon width={14} height={14} />
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {past.length > 0 ? (
        <section className="p-section">
          <div className="p-section-h">
            <h2>Past journeys</h2>
            <span>{past.length}</span>
          </div>
          <div className="p-list">
            {past.map((t, i) => (
              <Link
                key={t.id}
                href={`/portal/trips/${t.id}`}
                className="p-row"
                style={{ "--i": i } as CSSProperties}
              >
                <span className="p-thumb p-thumb--muted" aria-hidden>
                  {initials(t.destination || "Trip")}
                </span>
                <div>
                  <p className="p-row-title">{t.destination || "Your trip"}</p>
                  <p className="p-row-sub tnum">
                    {formatRange(t.departDate, t.returnDate)}
                    {nightsLabel(t.nights) ? ` · ${nightsLabel(t.nights)}` : ""}
                  </p>
                </div>
                <div className="p-row-end">
                  <span className="p-chip">Completed</span>
                  <ChevronRightIcon width={18} height={18} />
                </div>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}
