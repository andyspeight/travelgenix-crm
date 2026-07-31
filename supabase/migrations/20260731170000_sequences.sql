-- Sequences: a chase that runs over days, and stops the moment it should.
-- (Applied live 31 Jul 2026 — kept here as the record of the schema.)
--
-- A journey fires once. A sequence keeps going — day 0, day 4, day 10 —
-- which is how a quote actually gets chased. That makes STOPPING the
-- important part, not sending: a chase that carries on after someone has
-- replied is the difference between service and spam.
--
-- Nothing here auto-sends by default. auto_send is opt-in per sequence,
-- because "the CRM emailed my customers without me" is not a discovery
-- anyone should make.

create table if not exists sequences (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references agencies(id) on delete cascade,
  name text not null,
  description text,
  trigger_kind text not null,
  trigger_config jsonb not null default '{}'::jsonb,
  auto_send boolean not null default false,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists sequences_agency_idx on sequences (agency_id);

-- delay_days is measured from ENROLMENT, not from the previous step, so
-- editing one step cannot silently shift everything after it.
create table if not exists sequence_steps (
  id uuid primary key default gen_random_uuid(),
  sequence_id uuid not null references sequences(id) on delete cascade,
  step_number integer not null,
  delay_days integer not null default 0 check (delay_days >= 0),
  subject text not null,
  body text not null,
  unique (sequence_id, step_number)
);

create table if not exists sequence_enrolments (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references agencies(id) on delete cascade,
  sequence_id uuid not null references sequences(id) on delete cascade,
  household_id uuid references households(id) on delete cascade,
  trip_id uuid references trips(id) on delete set null,
  quote_id uuid references quotes(id) on delete set null,
  enquiry_id uuid,
  enrolled_at timestamptz not null default now(),
  steps_sent integer not null default 0,
  last_sent_at timestamptz,
  status text not null default 'active'
    check (status in ('active', 'completed', 'stopped')),
  stop_reason text,
  stopped_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists sequence_enrolments_active_idx
  on sequence_enrolments (agency_id, status);
create index if not exists sequence_enrolments_sequence_idx
  on sequence_enrolments (sequence_id);

-- One enrolment per subject per sequence: never chased twice down the same
-- track for the same thing.
create unique index if not exists sequence_enrolments_unique_subject
  on sequence_enrolments (sequence_id, coalesce(household_id::text, ''), coalesce(quote_id::text, ''), coalesce(trip_id::text, ''));

alter table sequences enable row level security;
alter table sequence_steps enable row level security;
alter table sequence_enrolments enable row level security;

drop policy if exists tenant_isolation on sequences;
create policy tenant_isolation on sequences for all
  using (agency_id = public.current_agency_id())
  with check (agency_id = public.current_agency_id());

drop policy if exists tenant_isolation on sequence_enrolments;
create policy tenant_isolation on sequence_enrolments for all
  using (agency_id = public.current_agency_id())
  with check (agency_id = public.current_agency_id());

drop policy if exists tenant_isolation on sequence_steps;
create policy tenant_isolation on sequence_steps for all
  using (exists (
    select 1 from public.sequences s
    where s.id = sequence_steps.sequence_id
      and s.agency_id = public.current_agency_id()))
  with check (exists (
    select 1 from public.sequences s
    where s.id = sequence_steps.sequence_id
      and s.agency_id = public.current_agency_id()));
