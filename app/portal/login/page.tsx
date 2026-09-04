import { redirect } from "next/navigation";
import { readPortalSession } from "@/lib/portal/require";
import { LoginScreen } from "./login-screen";

export const dynamic = "force-dynamic";

/** The neutral sign-in. Already signed in? Straight to the trips. */
export default async function PortalLoginPage({
  searchParams,
}: {
  searchParams: { expired?: string };
}) {
  if (await readPortalSession()) redirect("/portal");
  return <LoginScreen agency={null} expired={Boolean(searchParams.expired)} />;
}
