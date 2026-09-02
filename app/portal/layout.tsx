import type { CSSProperties } from "react";
import { notFound } from "next/navigation";
import { portalEnabled } from "@/lib/portal/session";
import { readPortalSession } from "@/lib/portal/require";
import { createPortalClient } from "@/lib/portal/client";
import { getBranding } from "@/lib/portal/data";
import "./portal.css";

export const dynamic = "force-dynamic";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  // Feature flag: with no signing secret set, the portal does not exist.
  if (!portalEnabled()) notFound();

  const session = await readPortalSession();
  const branding = session
    ? await getBranding(createPortalClient(), session.agencyId)
    : null;

  const accent = branding?.brandColor?.trim();
  const style = accent ? ({ "--portal-accent": accent } as CSSProperties) : undefined;

  return (
    <div className="portal" style={style}>
      <header className="portal-header">
        <div className="portal-brand">
          {branding?.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={branding.logoUrl} alt={branding.agencyName} />
          ) : (
            <span>{branding?.agencyName ?? "Your trips"}</span>
          )}
        </div>
        {session ? (
          <form action="/api/portal/logout" method="post">
            <button type="submit" className="portal-signout">Sign out</button>
          </form>
        ) : null}
      </header>
      {children}
    </div>
  );
}
