import { redirect } from "next/navigation";
import { readPortalSession } from "@/lib/portal/require";
import { createPortalClient } from "@/lib/portal/client";
import { findAgencyBySlug } from "@/lib/portal/lookup";
import { LoginScreen } from "../login/login-screen";

export const dynamic = "force-dynamic";

/**
 * /portal/<slug> — an agency's own front door. The same sign-in, wearing
 * their logo, colour and name, so the link an agency gives its customers
 * looks like theirs. An unknown slug falls back to the neutral screen.
 */
export default async function BrandedPortalLogin({
  params,
  searchParams,
}: {
  params: { agency: string };
  searchParams: { expired?: string };
}) {
  if (await readPortalSession()) redirect("/portal");
  const agency = await findAgencyBySlug(createPortalClient(), params.agency);
  if (!agency) redirect("/portal/login");
  return <LoginScreen agency={agency} expired={Boolean(searchParams.expired)} />;
}
