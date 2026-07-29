-- Email channel: real sending, recorded and suppressed honestly.
--
-- email_sends is the audit of every message the CRM actually dispatched:
-- who, what, why (purpose), through what context, and what the provider
-- said. email_suppressions is the do-not-send list the send path checks
-- before every dispatch — a hard bounce or spam complaint adds a row, and
-- from then on that address is refused with the reason shown to the agent.

create table if not exists email_sends (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null,
  household_id uuid references households(id) on delete set null,
  contact_id uuid references contacts(id) on delete set null,
  to_email text not null,
  subject text not null,
  body text not null,
  -- PECR distinction, same vocabulary as the consent gate.
  purpose text not null check (purpose in ('operational', 'marketing')),
  -- Where in the product the send came from (inbox_reply, enquiry_response,
  -- journey, ...). Free text so new surfaces need no migration.
  context text,
  status text not null default 'sent'
    check (status in ('sent', 'failed', 'bounced', 'complained')),
  provider_message_id text,
  error text,
  created_at timestamptz not null default now()
);

create index if not exists email_sends_agency_created_idx
  on email_sends (agency_id, created_at desc);
create index if not exists email_sends_household_idx
  on email_sends (household_id);
create index if not exists email_sends_provider_msg_idx
  on email_sends (provider_message_id);

create table if not exists email_suppressions (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null,
  email text not null,
  reason text not null check (reason in ('bounce', 'complaint', 'manual')),
  detail text,
  created_at timestamptz not null default now(),
  unique (agency_id, email)
);

create index if not exists email_suppressions_agency_email_idx
  on email_suppressions (agency_id, email);
