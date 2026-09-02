import Link from "next/link";
import { requirePortalSession } from "@/lib/portal/require";
import { createPortalClient } from "@/lib/portal/client";
import { getBranding, getContact } from "@/lib/portal/data";
import { ArrowLeftIcon } from "../icons";

export const dynamic = "force-dynamic";

export default async function PortalDetailsPage() {
  const session = await requirePortalSession();
  const supabase = createPortalClient();
  const [contact, branding] = await Promise.all([
    getContact(supabase, session.agencyId, session.contactId),
    getBranding(supabase, session.agencyId),
  ]);
  const name = contact ? [contact.firstName, contact.lastName].filter(Boolean).join(" ") : "";

  return (
    <main className="p-main p-main--narrow">
      <Link href="/portal" className="p-back">
        <ArrowLeftIcon width={16} height={16} />
        All trips
      </Link>
      <div className="p-eyebrow">Your details</div>
      <h1 className="p-h1">What we hold for you</h1>
      <p className="p-lead">
        The contact details {branding.agencyName} uses to keep your trips running smoothly.
      </p>

      <dl className="p-dl" style={{ marginTop: 28 }}>
        <div className="p-dl-row">
          <dt>Name</dt>
          <dd>{name || "—"}</dd>
        </div>
        <div className="p-dl-row">
          <dt>Email</dt>
          <dd>{contact?.email || "—"}</dd>
        </div>
        <div className="p-dl-row">
          <dt>Phone</dt>
          <dd>{contact?.phone || "—"}</dd>
        </div>
        {contact?.dietary ? (
          <div className="p-dl-row">
            <dt>Dietary</dt>
            <dd>{contact.dietary}</dd>
          </div>
        ) : null}
      </dl>
      <p className="p-note">
        Something changed? Reply to any email from {branding.agencyName} and they&rsquo;ll update it
        for you.
      </p>
    </main>
  );
}
