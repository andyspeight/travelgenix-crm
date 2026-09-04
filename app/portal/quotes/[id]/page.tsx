import type { CSSProperties } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePortalSession } from "@/lib/portal/require";
import { createPortalClient } from "@/lib/portal/client";
import { getBranding, getQuote } from "@/lib/portal/data";
import {
  daysUntil,
  formatDate,
  formatMoney,
  formatRange,
  glowFor,
  quoteState,
  quoteStatus,
} from "@/lib/portal/format";
import {
  ArrowLeftIcon,
  CalendarIcon,
  ClockIcon,
  MailIcon,
  MapPinIcon,
  TicketIcon,
  UsersIcon,
} from "../../icons";
import { QuoteActions } from "./quote-actions";

export const dynamic = "force-dynamic";

export default async function PortalQuotePage({ params }: { params: { id: string } }) {
  const session = await requirePortalSession();
  const supabase = createPortalClient();
  const [quote, branding] = await Promise.all([
    getQuote(supabase, session.agencyId, session.householdId, params.id),
    getBranding(supabase, session.agencyId),
  ]);
  if (!quote) notFound();

  const state = quoteState(quote);
  const disp = quoteStatus(state);
  const dest = quote.trip.destination || "Your trip";
  const price = formatMoney(quote.totalPrice, quote.currency);
  const deposit = formatMoney(quote.deposit, quote.currency);
  const expiresIn = daysUntil(quote.expiresAt);
  const reference = quote.reference || quote.trip.reference;
  const included = (quote.optionsSummary || "")
    .split(/\n{2,}/)
    .map((s) => s.trim())
    .filter(Boolean);

  return (
    <main className="p-main">
      <Link href="/portal" className="p-back">
        <ArrowLeftIcon width={16} height={16} />
        Home
      </Link>

      <div className="p-plate p-plate--hero" style={{ "--glow-x": glowFor(dest) } as CSSProperties}>
        <div className="p-plate-in">
          <div className="p-plate-top">
            <span className={`p-pill p-pill--${disp.badge}`}>
              <i aria-hidden />
              {disp.label}
            </span>
            <span className="p-plate-ref">Quote v{quote.version}</span>
            {reference ? <span className="p-plate-ref">{reference}</span> : null}
          </div>
          <h1 className="p-plate-dest">{dest}</h1>
          <div className="p-plate-meta">
            <span>
              <CalendarIcon width={16} height={16} />
              <span className="tnum">
                {formatRange(quote.trip.departDate, quote.trip.returnDate) || "Dates to be confirmed"}
              </span>
            </span>
            {quote.trip.nights ? (
              <span>
                <ClockIcon width={16} height={16} />
                {quote.trip.nights} night{quote.trip.nights === 1 ? "" : "s"}
              </span>
            ) : null}
            {quote.trip.occasion ? (
              <span>
                <MapPinIcon width={16} height={16} />
                {quote.trip.occasion}
              </span>
            ) : null}
          </div>
        </div>
      </div>

      <div className="p-body-grid">
        <section>
          <div className="p-section-h">
            <h2>What&rsquo;s included</h2>
            {quote.sentAt ? <span className="tnum">Sent {formatDate(quote.sentAt)}</span> : null}
          </div>
          {included.length === 0 ? (
            <div className="p-empty">
              <div className="p-empty-icon">
                <TicketIcon width={24} height={24} />
              </div>
              <div>
                <h3>The detail is with {branding.agencyName}</h3>
                <p>
                  Your agent will have sent the full proposal separately. This page is where you give
                  your answer.
                </p>
              </div>
            </div>
          ) : (
            <div className="p-prose">
              {included.map((para, i) => (
                <p key={i}>{para}</p>
              ))}
            </div>
          )}

          <div className="p-section">
            <div className="p-section-h">
              <h2>How this works</h2>
            </div>
            <ol className="p-steps">
              <li className="p-step">
                <span className="p-step-n">1</span>
                <div>
                  <b>Take your time, within the price window</b>
                  Prices and availability are held until the quote expires.
                </div>
              </li>
              <li className="p-step">
                <span className="p-step-n">2</span>
                <div>
                  <b>Accept to go ahead</b>
                  {branding.agencyName} confirms the booking and arranges payment with you directly.
                  Nothing is charged on this page.
                </div>
              </li>
              <li className="p-step">
                <span className="p-step-n">3</span>
                <div>
                  <b>Or tell us what to change</b>
                  Declining with a reason helps your agent come back with something better.
                </div>
              </li>
            </ol>
          </div>
        </section>

        <aside className="p-sticky">
          <div className="p-panel">
            <div className="p-panel-sec">
              <p className="p-panel-h">Your price</p>
              {price ? (
                <>
                  <p className="p-price">{price}</p>
                  <p className="p-price-sub">
                    {deposit ? `Deposit ${deposit} · ` : ""}
                    total for the party, {quote.currency}
                  </p>
                </>
              ) : (
                <p className="p-help" style={{ margin: 0 }}>Price to be confirmed by your agent</p>
              )}
            </div>
            {quote.expiresAt ? (
              <div className="p-panel-sec">
                <p className="p-iconline">
                  <ClockIcon width={16} height={16} />
                  <span className="tnum">
                    {state === "expired"
                      ? `Expired ${formatDate(quote.expiresAt)}`
                      : expiresIn !== null && expiresIn <= 14
                        ? `Valid for ${expiresIn} more day${expiresIn === 1 ? "" : "s"} (${formatDate(quote.expiresAt)})`
                        : `Valid until ${formatDate(quote.expiresAt)}`}
                  </span>
                </p>
              </div>
            ) : null}
            <div className="p-panel-sec">
              <QuoteActions
                quoteId={quote.id}
                tripId={quote.trip.id}
                initialState={state}
                version={quote.version}
                price={price || "the quoted price"}
                agencyName={branding.agencyName}
                contactEmail={branding.contactEmail}
              />
            </div>
            <div className="p-panel-sec">
              <p className="p-panel-h">Questions</p>
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
          </div>
        </aside>
      </div>
    </main>
  );
}
