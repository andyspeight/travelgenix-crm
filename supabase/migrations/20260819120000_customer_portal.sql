-- Customer portal — magic-link login tokens + per-agency logo.
--
-- The portal lets a travel agency's OWN customers (travellers) sign in to see
-- their own trips. Auth is passwordless: a single-use, short-lived token is
-- emailed as a link; clicking it mints a signed portal session cookie. This
-- table is the token store, so a given link works exactly once and only for a
-- short window.
--
-- Written and read ONLY by the portal API via the service-role client (which
-- bypasses RLS by design), so RLS is enabled with no policy — deny-by-default
-- for the published anon key, exactly like cron_runs. It carries no data a
-- browser should ever read directly.

create table if not exists portal_login_tokens (
  id           uuid primary key default gen_random_uuid(),
  -- sha256 of the raw token. The raw token exists only inside the emailed
  -- link, never in the database, so a leaked table row cannot be replayed.
  token_hash   text not null unique,
  agency_id    uuid not null references agencies(id) on delete cascade,
  household_id uuid not null references households(id) on delete cascade,
  contact_id   uuid not null references contacts(id) on delete cascade,
  email        text not null,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null,
  used_at      timestamptz
);
create index if not exists portal_login_tokens_hash_idx on portal_login_tokens (token_hash);
create index if not exists portal_login_tokens_expires_idx on portal_login_tokens (expires_at);

alter table portal_login_tokens enable row level security;
-- No policy is intentional: only the service-role client touches this table.

-- Per-agency logo for the customer-facing portal header. brand_color already
-- exists on agencies; this completes a credible branded traveller experience.
alter table agencies add column if not exists logo_url text;
