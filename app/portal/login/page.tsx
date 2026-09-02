import { redirect } from "next/navigation";
import { readPortalSession } from "@/lib/portal/require";
import { PlaneIcon, ShieldCheckIcon, AlertIcon } from "../icons";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

/**
 * The arrival screen: a split layout — a destination plate carrying the
 * promise on the left, the sign-in on the right. Already signed in? Straight
 * to the trips.
 */
export default async function PortalLoginPage({
  searchParams,
}: {
  searchParams: { expired?: string };
}) {
  if (await readPortalSession()) redirect("/portal");

  return (
    <div className="p-login">
      <section className="p-plate p-login-plate" aria-hidden>
        <div className="p-login-mark">
          <i>
            <PlaneIcon width={16} height={16} />
          </i>
          Your trips
        </div>
        <div className="p-login-tag">
          <h2>Your journeys, in one place.</h2>
          <p>Itineraries, dates and who&rsquo;s travelling, from the people who booked it for you.</p>
        </div>
      </section>

      <section className="p-login-form">
        <div>
          <div className="p-eyebrow">Sign in</div>
          <h1 className="p-h1">View your trips</h1>
          <p className="p-lead" style={{ fontSize: 15 }}>
            We&rsquo;ll email you a one-time link. No password to remember.
          </p>
          {searchParams.expired ? (
            <div className="p-error" role="alert">
              <AlertIcon width={16} height={16} />
              <span>That link had expired or was already used. Enter your email for a fresh one.</span>
            </div>
          ) : null}
          <LoginForm />
          <p className="p-trust">
            <ShieldCheckIcon width={16} height={16} />
            Secure one-time link, expires in 30 minutes
          </p>
        </div>
      </section>
    </div>
  );
}
