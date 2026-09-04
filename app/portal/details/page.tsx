import Link from "next/link";
import { requirePortalSession } from "@/lib/portal/require";
import { createPortalClient } from "@/lib/portal/client";
import { getAddress, getBranding, getContact } from "@/lib/portal/data";
import { ArrowLeftIcon } from "../icons";
import { DetailsForm } from "./details-form";

export const dynamic = "force-dynamic";

export default async function PortalDetailsPage() {
  const session = await requirePortalSession();
  const supabase = createPortalClient();
  const [contact, address, branding] = await Promise.all([
    getContact(supabase, session.agencyId, session.contactId),
    getAddress(supabase, session.agencyId, session.householdId),
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
        Keep your phone, dietary needs and address up to date and {branding.agencyName} will always
        have the right information for your trips.
      </p>

      {/* Fixed by the agent: these have to match travel documents. */}
      <dl className="p-dl" style={{ marginTop: 28 }}>
        <div className="p-dl-row">
          <dt>Name</dt>
          <dd>{name || "—"}</dd>
        </div>
        <div className="p-dl-row">
          <dt>Email</dt>
          <dd>{contact?.email || "—"}</dd>
        </div>
      </dl>
      <p className="p-note" style={{ marginTop: 12 }}>
        Your name and email have to match your travel documents and the bookings already made, so{" "}
        {branding.agencyName} changes those for you. Ask them and they&rsquo;ll sort it.
      </p>

      <DetailsForm
        agencyName={branding.agencyName}
        initial={{
          phone: contact?.phone ?? "",
          dietary: contact?.dietary ?? "",
          address_line1: address.line1 ?? "",
          address_line2: address.line2 ?? "",
          city: address.city ?? "",
          county: address.county ?? "",
          postcode: address.postcode ?? "",
        }}
      />
    </main>
  );
}
