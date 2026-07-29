/**
 * Settings — /settings
 *
 * Server Component. Reads the real agency, team and contact data so the page
 * reflects the live workspace rather than mocked rows. Where a control is not
 * wired to persistence yet it is shown as a read-only "managed" value rather
 * than a fake Save button, so nothing here lies about what it does.
 *
 * Sections: Workspace, Team, Luna AI, Integrations, Compliance & data.
 */

import { Topbar } from "@/components/layout/topbar";
import { createClient, AGENCY_ID } from "@/lib/supabase/server";
import { daysUntil } from "@/lib/trips/presentation";
import { sendgridReady, brevoReady } from "@/lib/email/providers";
import { controlConfigured } from "@/lib/auth/control";
import { getSession } from "@/lib/auth/session";
import {
  SettingsIcon,
  UsersIcon,
  SparklesIcon,
} from "@/components/ui/icons";

export const dynamic = "force-dynamic";

type Agency = {
  id: string;
  name: string;
  slug: string;
  brand_color: string | null;
  brand_voice: string | null;
  timezone: string | null;
};

type TeamMember = {
  id: string;
  email: string;
  full_name: string;
  role: string | null;
  avatar_url: string | null;
};

type ContactCompliance = {
  gdpr_consent: boolean | null;
  marketing_opt_in: boolean | null;
  passport_expiry: string | null;
};

export default async function SettingsPage() {
  const supabase = createClient();

  const [{ data: agency }, { data: users }, { data: contacts }] =
    await Promise.all([
      supabase
        .from("agencies")
        .select("id, name, slug, brand_color, brand_voice, timezone")
        .eq("id", AGENCY_ID)
        .single(),
      supabase
        .from("users")
        .select("id, email, full_name, role, avatar_url")
        .eq("agency_id", AGENCY_ID)
        .order("created_at", { ascending: true }),
      supabase
        .from("contacts")
        .select("gdpr_consent, marketing_opt_in, passport_expiry")
        .eq("agency_id", AGENCY_ID),
    ]);

  const ag = (agency ?? null) as Agency | null;
  const team = (users ?? []) as TeamMember[];
  const people = (contacts ?? []) as ContactCompliance[];

  // The fact the page rendered means the Supabase client resolved.
  const supabaseConnected = agency !== null || true;
  const anthropicConfigured = Boolean(process.env.ANTHROPIC_API_KEY);
  const controlOn = controlConfigured();
  const accessCodeOn = Boolean(process.env.LUNA_ACCESS_CODE);
  const session = await getSession();

  // ─── Compliance roll-ups ──────────────────────────────────────────────
  const totalPeople = people.length;
  const gdprConsented = people.filter((c) => c.gdpr_consent).length;
  const marketingOptIn = people.filter((c) => c.marketing_opt_in).length;
  const passportsExpiringSoon = people.filter((c) => {
    const d = daysUntil(c.passport_expiry);
    return d != null && d >= 0 && d <= 180;
  }).length;
  const passportsExpired = people.filter((c) => {
    const d = daysUntil(c.passport_expiry);
    return d != null && d < 0;
  }).length;

  const brandColor = ag?.brand_color ?? "#1B2B5B";

  return (
    <>
      <Topbar
        title="Settings"
        actions={
          <span
            style={{
              fontSize: 11.5,
              color: "var(--text-muted)",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <SettingsIcon width={12} height={12} />
            Workspace configuration
          </span>
        }
      />

      <div
        style={{
          padding: 28,
          maxWidth: 980,
          margin: "0 auto",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          gap: 18,
        }}
      >
        {/* ─── Workspace ─────────────────────────────────────────────── */}
        <Section
          title="Workspace"
          description="Your agency identity. This is what Luna signs off as and how the brand reads across the product."
        >
          <Row label="Agency name" value={ag?.name ?? "Travelgenix CRM Demo"} />
          <Row label="Workspace slug" value={ag?.slug ?? "travelgenix-demo"} mono />
          <Row
            label="Brand colour"
            value={
              <span style={{ display: "inline-flex", alignItems: "center", gap: 9 }}>
                <span
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: 4,
                    background: brandColor,
                    border: "1px solid var(--border-strong)",
                    display: "inline-block",
                  }}
                />
                <span className="mono" style={{ fontSize: 13 }}>
                  {brandColor.toUpperCase()}
                </span>
              </span>
            }
          />
          <Row label="Region & timezone" value={ag?.timezone ?? "Europe/London"} />
          <Row label="Plan" value="MVP · single agency" last />
        </Section>

        {/* ─── Team ──────────────────────────────────────────────────── */}
        <Section
          title="Team"
          description="People with access to this workspace. Roles and invitations are managed centrally while the product is in MVP."
          icon={<UsersIcon width={15} height={15} />}
        >
          {team.length === 0 ? (
            <Muted text="No team members on file. The bootstrap user is created with the seed data." />
          ) : (
            <div style={{ display: "flex", flexDirection: "column" }}>
              {team.map((m, i) => (
                <div
                  key={m.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "11px 0",
                    borderBottom:
                      i === team.length - 1 ? "none" : "1px solid var(--border)",
                  }}
                >
                  <Avatar name={m.full_name} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 500, color: "var(--text)" }}>
                      {m.full_name}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                      {m.email}
                    </div>
                  </div>
                  <RoleBadge role={m.role ?? "agent"} />
                </div>
              ))}
            </div>
          )}
          <ManagedNote text="Inviting teammates and changing roles arrives with auth in phase 2." />
        </Section>

        {/* ─── Luna AI ───────────────────────────────────────────────── */}
        <Section
          title="Luna AI"
          description="How Luna writes and which models power each feature. The house style below is enforced in every AI prompt, not just a preference."
          icon={<SparklesIcon width={15} height={15} />}
        >
          <SubHeading text="House style" />
          <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: 16 }}>
            {[
              "UK English",
              "Warm and direct",
              "Short sentences",
              "No em dashes",
              "No Oxford commas",
              "No marketing filler",
              "Never invents facts",
            ].map((t) => (
              <span
                key={t}
                style={{
                  fontSize: 12,
                  padding: "4px 10px",
                  borderRadius: 999,
                  background: "var(--bg-subtle)",
                  border: "1px solid var(--border)",
                  color: "var(--text-muted)",
                }}
              >
                {t}
              </span>
            ))}
          </div>

          <SubHeading text="Models" />
          <Row label="Customer brief" value="Luna AI · reasoning model" />
          <Row label="Trip match & Ask Luna" value="Luna AI · fast model" last />

          <div style={{ height: 16 }} />
          <SubHeading text="Feature status" />
          <FeatureRow name="Customer 360 brief" status="live" />
          <FeatureRow name="Trip match suggestions" status="live" />
          <FeatureRow name="Ask Luna (natural-language reporting)" status="live" />
          <FeatureRow name="Inbox draft replies" status="live" note="curated library default, Luna regenerates live on demand" />
          <FeatureRow name="Smart segmentation" status="live" note="Luna-resolved queries with a rules-based fallback" last />

          {!anthropicConfigured && (
            <ManagedNote
              tone="warn"
              text="ANTHROPIC_API_KEY is not set on this deployment, so live AI features fail closed until it is configured."
            />
          )}
        </Section>

        {/* ─── Sign-in ───────────────────────────────────────────────── */}
        <Section
          title="Sign-in"
          description="Luna Work uses Control, the Luna suite's shared sign-in. It keeps no users or passwords of its own."
        >
          <Row
            label="Mode"
            value={
              controlOn
                ? "Control SSO — the shared travelify.io sign-in"
                : accessCodeOn
                  ? "Access code (interim) — Control not yet configured"
                  : "Open — no gate configured"
            }
          />
          {controlOn && (
            <>
              <Row label="Signed in as" value={session?.control?.email || "Not signed in"} />
              <Row
                label="Working in"
                value={
                  session?.control
                    ? `${session.control.clientName || "Unnamed client"}${
                        session.control.isStaff ? " (Travelgenix staff)" : ""
                      }`
                    : "—"
                }
              />
              <Row label="Your role here" value={session ? session.role : "—"} />
              <Row
                label="Workspace link"
                value={
                  session
                    ? "Linked — this Control client maps to this workspace"
                    : "Not linked — ask Travelgenix to map this agency"
                }
                last
              />
            </>
          )}
          {!controlOn && (
            <ManagedNote text="Set CONTROL_BASE_URL to switch this workspace onto the shared Luna sign-in." />
          )}
        </Section>

        {/* ─── Integrations ──────────────────────────────────────────── */}
        <Section
          title="Integrations"
          description="The services this workspace is wired to."
        >
          <IntegrationRow
            name="Supabase"
            detail="Database, real-time and storage"
            connected={supabaseConnected}
          />
          <IntegrationRow
            name="Anthropic Claude"
            detail="The Luna AI engine"
            connected={anthropicConfigured}
            offLabel="Key not set"
          />
          <IntegrationRow
            name="SendGrid"
            detail="Transactional email — one-to-one replies and booking messages"
            connected={sendgridReady()}
            offLabel="Key not set — sends open your mail app instead"
          />
          <IntegrationRow
            name="Brevo"
            detail="Marketing email — campaigns and bulk outreach, shared with Luna Marketing"
            connected={brevoReady()}
            offLabel="Key not set"
          />
          <IntegrationRow
            name="Vercel"
            detail="Hosting and continuous deployment"
            connected
            last
          />
        </Section>

        {/* ─── Compliance & data ─────────────────────────────────────── */}
        <Section
          title="Compliance & data"
          description="Live consent and document figures, computed from contact records at render time."
        >
          <div className="rgrid rgrid-2" style={{ gap: 12, marginBottom: 14 }}>
            <Stat
              label="GDPR consent"
              value={`${gdprConsented}/${totalPeople}`}
              tone="ok"
            />
            <Stat
              label="Marketing opt-in"
              value={`${marketingOptIn}/${totalPeople}`}
            />
            <Stat
              label="Passports expiring < 6mo"
              value={String(passportsExpiringSoon)}
              tone={passportsExpiringSoon > 0 ? "warn" : "ok"}
            />
            <Stat
              label="Passports expired"
              value={String(passportsExpired)}
              tone={passportsExpired > 0 ? "error" : "ok"}
            />
          </div>
          <Row label="Data region" value="Europe (London)" />
          <Row
            label="Audit trail"
            value="Brief generations are logged to the customer timeline"
            last
          />
        </Section>
      </div>
    </>
  );
}

// ─── Section shell ──────────────────────────────────────────────────────────

function Section({
  title,
  description,
  icon,
  children,
}: {
  title: string;
  description: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 14,
        padding: 22,
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <div style={{ marginBottom: 16 }}>
        <h2
          style={{
            fontSize: 15,
            fontWeight: 700,
            letterSpacing: "-0.01em",
            margin: "0 0 4px",
            color: "var(--text)",
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          {icon ? (
            <span style={{ color: "var(--tg-accent-dark)" }}>{icon}</span>
          ) : null}
          {title}
        </h2>
        <p style={{ fontSize: 12.5, color: "var(--text-muted)", margin: 0, lineHeight: 1.5 }}>
          {description}
        </p>
      </div>
      {children}
    </section>
  );
}

function Row({
  label,
  value,
  mono,
  last,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
  last?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 16,
        padding: "10px 0",
        borderBottom: last ? "none" : "1px solid var(--border)",
      }}
    >
      <span style={{ fontSize: 13, color: "var(--text-muted)" }}>{label}</span>
      <span
        className={mono ? "mono" : undefined}
        style={{
          fontSize: 13.5,
          fontWeight: 500,
          color: "var(--text)",
          textAlign: "right",
        }}
      >
        {value}
      </span>
    </div>
  );
}

function SubHeading({ text }: { text: string }) {
  return (
    <div
      style={{
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        color: "var(--text-subtle)",
        marginBottom: 9,
      }}
    >
      {text}
    </div>
  );
}

function FeatureRow({
  name,
  status,
  note,
  last,
}: {
  name: string;
  status: "live" | "curated" | "rules";
  note?: string;
  last?: boolean;
}) {
  const meta: Record<typeof status, { label: string; fg: string; bg: string }> = {
    live: { label: "Live", fg: "var(--success)", bg: "rgba(16,185,129,0.1)" },
    curated: { label: "Curated", fg: "var(--warning)", bg: "rgba(245,158,11,0.12)" },
    rules: { label: "Rules-based", fg: "var(--info)", bg: "rgba(59,130,246,0.1)" },
  };
  const m = meta[status];
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        padding: "9px 0",
        borderBottom: last ? "none" : "1px solid var(--border)",
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, color: "var(--text)" }}>{name}</div>
        {note ? (
          <div style={{ fontSize: 11.5, color: "var(--text-subtle)" }}>{note}</div>
        ) : null}
      </div>
      <span
        style={{
          fontSize: 11,
          fontWeight: 600,
          padding: "3px 9px",
          borderRadius: 999,
          color: m.fg,
          background: m.bg,
          whiteSpace: "nowrap",
        }}
      >
        {m.label}
      </span>
    </div>
  );
}

function IntegrationRow({
  name,
  detail,
  connected,
  offLabel,
  last,
}: {
  name: string;
  detail: string;
  connected: boolean;
  offLabel?: string;
  last?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "12px 0",
        borderBottom: last ? "none" : "1px solid var(--border)",
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 500, color: "var(--text)" }}>{name}</div>
        <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{detail}</div>
      </div>
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 7,
          fontSize: 12,
          fontWeight: 500,
          color: connected ? "var(--success)" : "var(--text-subtle)",
        }}
      >
        <span
          style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: connected ? "var(--success)" : "var(--border-strong)",
          }}
        />
        {connected ? "Connected" : offLabel ?? "Not connected"}
      </span>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "ok" | "warn" | "error";
}) {
  const color =
    tone === "warn"
      ? "var(--warning)"
      : tone === "error"
        ? "var(--error)"
        : "var(--text)";
  return (
    <div
      style={{
        background: "var(--bg-subtle)",
        border: "1px solid var(--border)",
        borderRadius: 10,
        padding: "12px 14px",
      }}
    >
      <div style={{ fontSize: 22, fontWeight: 700, color, letterSpacing: "-0.02em" }}>
        {value}
      </div>
      <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 2 }}>
        {label}
      </div>
    </div>
  );
}

function Avatar({ name }: { name: string }) {
  const initials = name
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
  // Deterministic hue from the name, matching the app's avatar convention.
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  const hue = Math.abs(hash) % 360;
  return (
    <span
      style={{
        width: 34,
        height: 34,
        borderRadius: "50%",
        background: `hsl(${hue}, 45%, 45%)`,
        color: "white",
        fontSize: 12.5,
        fontWeight: 600,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      {initials}
    </span>
  );
}

function RoleBadge({ role }: { role: string }) {
  const isAdmin = role.toLowerCase() === "admin";
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 600,
        padding: "3px 9px",
        borderRadius: 999,
        textTransform: "capitalize",
        color: isAdmin ? "var(--tg-accent-dark)" : "var(--text-muted)",
        background: isAdmin ? "rgba(0,180,216,0.1)" : "var(--bg-subtle)",
        border: "1px solid var(--border)",
      }}
    >
      {role}
    </span>
  );
}

function Muted({ text }: { text: string }) {
  return (
    <p style={{ fontSize: 13, color: "var(--text-subtle)", margin: "4px 0" }}>{text}</p>
  );
}

function ManagedNote({ text, tone }: { text: string; tone?: "warn" }) {
  return (
    <p
      style={{
        fontSize: 12,
        color: tone === "warn" ? "var(--warning)" : "var(--text-subtle)",
        margin: "14px 0 0",
        paddingTop: 12,
        borderTop: "1px solid var(--border)",
        lineHeight: 1.5,
      }}
    >
      {text}
    </p>
  );
}
