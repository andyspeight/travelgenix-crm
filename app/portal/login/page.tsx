import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default function PortalLoginPage({
  searchParams,
}: {
  searchParams: { expired?: string };
}) {
  return (
    <main className="portal-main portal-narrow">
      <h1 className="portal-h1">View your trips</h1>
      <p className="portal-sub">
        Enter your email and we&apos;ll send you a secure link — no password needed.
      </p>
      {searchParams.expired ? (
        <p className="portal-error">
          That link had expired or was already used. Enter your email for a fresh one.
        </p>
      ) : null}
      <div className="portal-card">
        <LoginForm />
      </div>
    </main>
  );
}
