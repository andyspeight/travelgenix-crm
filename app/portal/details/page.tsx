import Link from "next/link";
import { requirePortalSession } from "@/lib/portal/require";
import { createPortalClient } from "@/lib/portal/client";
import { getContact } from "@/lib/portal/data";

export const dynamic = "force-dynamic";

export default async function PortalDetailsPage() {
  const session = await requirePortalSession();
  const contact = await getContact(createPortalClient(), session.agencyId, session.contactId);

  const name = contact ? [contact.firstName, contact.lastName].filter(Boolean).join(" ") : "";

  return (
    <main className="portal-main portal-narrow">
      <Link href="/portal" className="portal-back">← All trips</Link>
      <h1 className="portal-h1">Your details</h1>
      <p className="portal-sub">What we have on file for you.</p>

      <div className="portal-card">
        <dl className="portal-dl">
          <dt>Name</dt>
          <dd>{name || "—"}</dd>
          <dt>Email</dt>
          <dd>{contact?.email || "—"}</dd>
          <dt>Phone</dt>
          <dd>{contact?.phone || "—"}</dd>
          {contact?.dietary ? (
            <>
              <dt>Dietary</dt>
              <dd>{contact.dietary}</dd>
            </>
          ) : null}
        </dl>
      </div>
      <p className="portal-note">
        Need something changed? Just reply to any email from your travel agent and they&apos;ll
        update it.
      </p>
    </main>
  );
}
