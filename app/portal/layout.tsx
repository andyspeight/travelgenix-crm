import type { CSSProperties } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { portalEnabled } from "@/lib/portal/session";
import { readPortalSession } from "@/lib/portal/require";
import { createPortalClient } from "@/lib/portal/client";
import { getBranding, getContact } from "@/lib/portal/data";
import { initials } from "@/lib/portal/format";
import { LogOutIcon } from "./icons";
import "./portal.css";

export const dynamic = "force-dynamic";

/**
 * The portal shell. Branded per agency (brand colour becomes the accent, logo
 * in the header) and completely separate from the agent chrome. The header
 * only exists for a signed-in traveller; the login screen is its own full
 * arrival layout.
 */
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  // Feature flag: with no signing secret set, the portal does not exist.
  if (!portalEnabled()) notFound();

  const session = await readPortalSession();
  let branding: Awaited<ReturnType<typeof getBranding>> | null = null;
  let who = "";
  if (session) {
    const supabase = createPortalClient();
    const [b, c] = await Promise.all([
      getBranding(supabase, session.agencyId),
      getContact(supabase, session.agencyId, session.contactId),
    ]);
    branding = b;
    who = c ? [c.firstName, c.lastName].filter(Boolean).join(" ") : "";
  }

  const accent = branding?.brandColor?.trim();
  const style = accent ? ({ "--portal-accent": accent } as CSSProperties) : undefined;

  return (
    <div className="portal" style={style}>
      {session && branding ? (
        <header className="p-header">
          <Link href="/portal" className="p-brand" aria-label={`${branding.agencyName} home`}>
            {branding.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={branding.logoUrl} alt={branding.agencyName} />
            ) : (
              <>
                <span className="p-brand-mark" aria-hidden>{initials(branding.agencyName)}</span>
                <span>{branding.agencyName}</span>
              </>
            )}
          </Link>
          <div className="p-user">
            {who ? (
              <span className="p-avatar" title={who} aria-label={who}>{initials(who)}</span>
            ) : null}
            <form action="/api/portal/logout" method="post">
              <button type="submit" className="p-ghost">
                <LogOutIcon width={16} height={16} />
                Sign out
              </button>
            </form>
          </div>
        </header>
      ) : null}
      {children}
    </div>
  );
}
