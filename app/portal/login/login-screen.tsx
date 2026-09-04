import type { CSSProperties } from "react";
import type { AgencyMatch } from "@/lib/portal/lookup";
import { PlaneIcon, ShieldCheckIcon, AlertIcon } from "../icons";
import { LoginForm } from "./login-form";

/**
 * The arrival screen: a split layout, a destination plate carrying the
 * promise on the left, the sign-in on the right. With an agency (a branded
 * /portal/<slug> URL) the plate wears their logo and colour and the copy
 * names them; without one it is the neutral Travelgenix screen.
 */
export function LoginScreen({ agency, expired }: { agency: AgencyMatch | null; expired: boolean }) {
  const accent = agency?.brandColor?.trim();
  const style = accent ? ({ "--portal-accent": accent } as CSSProperties) : undefined;
  const name = agency?.name;

  return (
    <div className="p-login" style={style}>
      <section className="p-plate p-login-plate" aria-hidden>
        {agency?.logoUrl ? (
          <div className="p-login-logo">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={agency.logoUrl} alt="" />
          </div>
        ) : (
          <div className="p-login-mark">
            <i>
              <PlaneIcon width={16} height={16} />
            </i>
            {name ?? "Your trips"}
          </div>
        )}
        <div className="p-login-tag">
          <h2>Your journeys, in one place.</h2>
          <p>
            {name
              ? `Itineraries, quotes and who's travelling, from ${name}.`
              : "Itineraries, quotes and who's travelling, from the people who booked it for you."}
          </p>
        </div>
      </section>

      <section className="p-login-form">
        <div>
          <div className="p-eyebrow">{name ? `${name} customers` : "Sign in"}</div>
          <h1 className="p-h1">View your trips</h1>
          <p className="p-lead" style={{ fontSize: 15 }}>
            We&rsquo;ll email you a one-time link. No password to remember.
          </p>
          {expired ? (
            <div className="p-error" role="alert">
              <AlertIcon width={16} height={16} />
              <span>That link had expired or was already used. Enter your email for a fresh one.</span>
            </div>
          ) : null}
          <LoginForm agency={agency?.slug} />
          <p className="p-trust">
            <ShieldCheckIcon width={16} height={16} />
            Secure one-time link, expires in 30 minutes
          </p>
        </div>
      </section>
    </div>
  );
}
