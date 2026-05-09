-- ════════════════════════════════════════════════════════════════════════
--  Travelgenix CRM (Luna Work) — Initial Schema
--  Day 1 of MVP build · 9 May 2026
--
--  Run this once via Supabase SQL Editor:
--    1. Open your Supabase project
--    2. Click SQL Editor in the left sidebar
--    3. Click "New query"
--    4. Paste this entire file
--    5. Click "Run"
--    6. Green tick → schema is live
--
--  This schema is intentionally lean. It captures the relationships that
--  matter (households, contacts, trips, interactions) and uses JSONB for
--  flexible fields that evolve quickly (preferences, trip components).
--  RLS is disabled for the MVP — we're single-tenant, no auth.
-- ════════════════════════════════════════════════════════════════════════

-- ─── Extensions ────────────────────────────────────────────────────────
create extension if not exists "uuid-ossp";
create extension if not exists "pg_trgm";  -- for fuzzy text search later

-- ─── Enums ─────────────────────────────────────────────────────────────
do $$ begin
  create type trip_stage as enum (
    'enquiry', 'quoted', 'booked', 'pre_departure', 'travelling', 'returned', 'cancelled'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type contact_role as enum ('lead', 'partner', 'child', 'dependant', 'other');
exception when duplicate_object then null; end $$;

do $$ begin
  create type interaction_kind as enum (
    'email_in', 'email_out', 'chat', 'enquiry', 'call', 'note', 'system'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type task_status as enum ('open', 'doing', 'done', 'snoozed', 'cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type journey_trigger as enum (
    'days_to_departure', 'days_after_return', 'birthday', 'anniversary',
    'passport_expiring', 'no_contact_period', 'custom'
  );
exception when duplicate_object then null; end $$;

-- ─── Helper: updated_at trigger function ──────────────────────────────
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- ════════════════════════════════════════════════════════════════════════
--  CORE: Agencies (single row in MVP, multi-tenant ready)
-- ════════════════════════════════════════════════════════════════════════
create table agencies (
  id           uuid primary key default uuid_generate_v4(),
  name         text not null,
  slug         text unique not null,
  brand_color  text,
  brand_voice  text,
  timezone     text default 'Europe/London',
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);
create trigger agencies_updated_at before update on agencies
  for each row execute function set_updated_at();

-- ════════════════════════════════════════════════════════════════════════
--  CORE: Users (agency team members — auth wires in phase 2)
-- ════════════════════════════════════════════════════════════════════════
create table users (
  id           uuid primary key default uuid_generate_v4(),
  agency_id    uuid not null references agencies(id) on delete cascade,
  email        text not null,
  full_name    text not null,
  role         text default 'agent',         -- 'admin' | 'agent' | 'viewer'
  avatar_url   text,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);
create unique index users_agency_email on users(agency_id, lower(email));
create trigger users_updated_at before update on users
  for each row execute function set_updated_at();

-- ════════════════════════════════════════════════════════════════════════
--  HOUSEHOLDS — the unit of the customer relationship
-- ════════════════════════════════════════════════════════════════════════
create table households (
  id              uuid primary key default uuid_generate_v4(),
  agency_id       uuid not null references agencies(id) on delete cascade,
  display_name    text not null,            -- "Sarah & James Thompson"
  household_type  text,                     -- 'family' | 'couple' | 'solo' | 'group'
  city            text,
  postcode        text,
  country         text default 'GB',
  tags            text[] default '{}',      -- ['VIP', 'Repeat', 'Anniversary']
  notes           text,
  customer_since  date,
  lifetime_value  numeric(12, 2) default 0,
  trips_count     int default 0,            -- denormalised counter
  last_booking_at timestamptz,              -- denormalised
  next_departure  date,                     -- denormalised, refreshed by trigger
  owner_user_id   uuid references users(id) on delete set null,
  ai_brief        text,                     -- last cached AI brief
  ai_brief_at     timestamptz,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);
create index households_agency on households(agency_id);
create index households_owner on households(owner_user_id);
create index households_search on households using gin (display_name gin_trgm_ops);
create index households_next_departure on households(next_departure) where next_departure is not null;
create trigger households_updated_at before update on households
  for each row execute function set_updated_at();

-- ════════════════════════════════════════════════════════════════════════
--  CONTACTS — individual people belonging to a household
-- ════════════════════════════════════════════════════════════════════════
create table contacts (
  id              uuid primary key default uuid_generate_v4(),
  agency_id       uuid not null references agencies(id) on delete cascade,
  household_id    uuid not null references households(id) on delete cascade,
  role            contact_role not null default 'lead',
  first_name      text not null,
  last_name       text,
  email           text,
  phone           text,
  date_of_birth   date,
  passport_number text,                     -- encrypted in phase 2
  passport_expiry date,
  passport_country text,
  dietary         text,                     -- "nut allergy", "vegan"
  flags           text[] default '{}',      -- ['allergy', 'mobility', 'unaccompanied_minor']
  marketing_opt_in boolean default false,
  marketing_opt_in_at timestamptz,
  gdpr_consent    boolean default false,
  gdpr_consent_at timestamptz,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);
create index contacts_household on contacts(household_id);
create index contacts_agency on contacts(agency_id);
create index contacts_email on contacts(lower(email));
create index contacts_passport_expiry on contacts(passport_expiry) where passport_expiry is not null;
create trigger contacts_updated_at before update on contacts
  for each row execute function set_updated_at();

-- ════════════════════════════════════════════════════════════════════════
--  SUPPLIERS — Jet2, TUI, Hotelbeds, etc.
-- ════════════════════════════════════════════════════════════════════════
create table suppliers (
  id           uuid primary key default uuid_generate_v4(),
  agency_id    uuid not null references agencies(id) on delete cascade,
  name         text not null,
  category     text,                       -- 'tour_operator' | 'hotel' | 'flight' | 'transfer' | 'insurance' | 'experience'
  rating       numeric(3, 2),              -- internal 0-5 score
  flags        text[] default '{}',        -- ['avoid', 'preferred']
  notes        text,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);
create index suppliers_agency on suppliers(agency_id);
create trigger suppliers_updated_at before update on suppliers
  for each row execute function set_updated_at();

-- ════════════════════════════════════════════════════════════════════════
--  TRIPS — the lifecycle from enquiry to returned
-- ════════════════════════════════════════════════════════════════════════
create table trips (
  id              uuid primary key default uuid_generate_v4(),
  agency_id       uuid not null references agencies(id) on delete cascade,
  household_id    uuid not null references households(id) on delete cascade,
  reference       text,                     -- TG-2026-001
  stage           trip_stage not null default 'enquiry',
  destination     text,                     -- "Crete, Greece"
  destination_country text,                 -- ISO code: GR
  depart_date     date,
  return_date     date,
  duration_nights int,
  total_value     numeric(12, 2),
  currency        text default 'GBP',
  commission      numeric(12, 2),
  occasion        text,                     -- "anniversary", "honeymoon", "school holiday"
  notes           text,
  owner_user_id   uuid references users(id) on delete set null,
  source          text,                     -- 'widget_enquiry', 'phone', 'walk_in', 'referral'
  source_meta     jsonb default '{}',       -- arbitrary source context
  ai_predictions  jsonb default '{}',       -- {close_probability, match_score, risk_flags}
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);
create index trips_household on trips(household_id);
create index trips_agency on trips(agency_id);
create index trips_stage on trips(stage);
create index trips_depart on trips(depart_date) where depart_date is not null;
create index trips_owner on trips(owner_user_id);
create trigger trips_updated_at before update on trips
  for each row execute function set_updated_at();

-- ════════════════════════════════════════════════════════════════════════
--  TRIP PASSENGERS — which contacts are on which trip
-- ════════════════════════════════════════════════════════════════════════
create table trip_passengers (
  trip_id      uuid not null references trips(id) on delete cascade,
  contact_id   uuid not null references contacts(id) on delete cascade,
  is_lead      boolean default false,
  primary key (trip_id, contact_id)
);
create index trip_passengers_contact on trip_passengers(contact_id);

-- ════════════════════════════════════════════════════════════════════════
--  TRIP COMPONENTS — flights, hotels, transfers, insurance, experiences
-- ════════════════════════════════════════════════════════════════════════
create table trip_components (
  id            uuid primary key default uuid_generate_v4(),
  trip_id       uuid not null references trips(id) on delete cascade,
  supplier_id   uuid references suppliers(id) on delete set null,
  kind          text not null,             -- 'flight' | 'hotel' | 'transfer' | 'insurance' | 'experience' | 'other'
  title         text not null,             -- "BA flights LHR-HER" or "Vakkaru Maldives, 7 nights"
  details       jsonb default '{}',        -- flight numbers, room type, board basis, etc.
  start_date    date,
  end_date      date,
  cost          numeric(12, 2),
  currency      text default 'GBP',
  status        text default 'pending',    -- 'pending' | 'confirmed' | 'cancelled'
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);
create index trip_components_trip on trip_components(trip_id);
create index trip_components_supplier on trip_components(supplier_id);
create trigger trip_components_updated_at before update on trip_components
  for each row execute function set_updated_at();

-- ════════════════════════════════════════════════════════════════════════
--  INTERACTIONS — every email, chat, enquiry, call, note (the unified inbox)
-- ════════════════════════════════════════════════════════════════════════
create table interactions (
  id              uuid primary key default uuid_generate_v4(),
  agency_id       uuid not null references agencies(id) on delete cascade,
  household_id    uuid references households(id) on delete cascade,
  contact_id      uuid references contacts(id) on delete set null,
  trip_id         uuid references trips(id) on delete set null,
  user_id         uuid references users(id) on delete set null,
  kind            interaction_kind not null,
  channel         text,                     -- 'email' | 'live_chat' | 'whatsapp' | 'phone' | 'web_form'
  direction       text default 'inbound',   -- 'inbound' | 'outbound' | 'internal'
  subject         text,
  body            text,
  body_summary    text,                     -- AI-generated short summary
  metadata        jsonb default '{}',       -- {message_id, thread_id, attachments, etc.}
  -- Triage and AI
  ai_priority     text,                     -- 'today' | 'week' | 'later'
  ai_reason       text,                     -- Luna's one-line reasoning
  ai_drafts       jsonb default '{}',       -- {brief, warm, detailed} reply drafts
  is_read         boolean default false,
  is_triaged      boolean default false,
  occurred_at     timestamptz default now(),
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);
create index interactions_household on interactions(household_id);
create index interactions_trip on interactions(trip_id);
create index interactions_agency on interactions(agency_id);
create index interactions_kind on interactions(kind);
create index interactions_priority on interactions(ai_priority) where ai_priority is not null;
create index interactions_occurred on interactions(occurred_at desc);
create index interactions_unread on interactions(agency_id, occurred_at desc) where is_read = false;
create trigger interactions_updated_at before update on interactions
  for each row execute function set_updated_at();

-- ════════════════════════════════════════════════════════════════════════
--  TASKS — follow-ups, reminders, journey-triggered actions
-- ════════════════════════════════════════════════════════════════════════
create table tasks (
  id              uuid primary key default uuid_generate_v4(),
  agency_id       uuid not null references agencies(id) on delete cascade,
  household_id    uuid references households(id) on delete cascade,
  trip_id         uuid references trips(id) on delete cascade,
  assigned_to     uuid references users(id) on delete set null,
  title           text not null,
  description     text,
  status          task_status default 'open',
  priority        int default 0,            -- 0 normal, higher = more urgent
  due_at          timestamptz,
  completed_at    timestamptz,
  source          text,                     -- 'manual' | 'journey' | 'ai_suggestion'
  source_meta     jsonb default '{}',
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);
create index tasks_agency on tasks(agency_id);
create index tasks_assigned on tasks(assigned_to) where assigned_to is not null;
create index tasks_household on tasks(household_id);
create index tasks_due on tasks(due_at) where status in ('open', 'doing');
create trigger tasks_updated_at before update on tasks
  for each row execute function set_updated_at();

-- ════════════════════════════════════════════════════════════════════════
--  NOTES — free-form notes attached to households or contacts
-- ════════════════════════════════════════════════════════════════════════
create table notes (
  id              uuid primary key default uuid_generate_v4(),
  agency_id       uuid not null references agencies(id) on delete cascade,
  household_id    uuid references households(id) on delete cascade,
  contact_id      uuid references contacts(id) on delete cascade,
  trip_id         uuid references trips(id) on delete cascade,
  author_id       uuid references users(id) on delete set null,
  body            text not null,
  pinned          boolean default false,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);
create index notes_household on notes(household_id);
create index notes_contact on notes(contact_id);
create index notes_trip on notes(trip_id);
create trigger notes_updated_at before update on notes
  for each row execute function set_updated_at();

-- ════════════════════════════════════════════════════════════════════════
--  PREFERENCES — first-class household preferences
-- ════════════════════════════════════════════════════════════════════════
create table preferences (
  id            uuid primary key default uuid_generate_v4(),
  household_id  uuid not null references households(id) on delete cascade,
  contact_id    uuid references contacts(id) on delete cascade,
  category      text not null,             -- 'airline' | 'seat' | 'room' | 'dietary' | 'budget' | 'avoid' | 'style'
  key           text,                       -- "preferred_airline"
  value         text,                       -- "BA, Emirates"
  source        text default 'manual',      -- 'manual' | 'inferred' | 'survey'
  confidence    numeric(3, 2) default 1.0,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);
create index preferences_household on preferences(household_id);
create index preferences_category on preferences(household_id, category);
create trigger preferences_updated_at before update on preferences
  for each row execute function set_updated_at();

-- ════════════════════════════════════════════════════════════════════════
--  JOURNEYS — auto-pilot rules (trigger + action template)
-- ════════════════════════════════════════════════════════════════════════
create table journeys (
  id              uuid primary key default uuid_generate_v4(),
  agency_id       uuid not null references agencies(id) on delete cascade,
  name            text not null,
  description     text,
  trigger_kind    journey_trigger not null,
  trigger_config  jsonb default '{}',       -- {days: 10}, {months: 18}, custom rules
  action_kind     text not null,            -- 'draft_email' | 'create_task' | 'add_note'
  action_config   jsonb default '{}',       -- prompt template, tone, etc.
  is_active       boolean default true,
  last_run_at     timestamptz,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);
create index journeys_agency on journeys(agency_id);
create index journeys_active on journeys(agency_id) where is_active = true;
create trigger journeys_updated_at before update on journeys
  for each row execute function set_updated_at();

-- ════════════════════════════════════════════════════════════════════════
--  JOURNEY RUNS — log of every triggered journey instance
-- ════════════════════════════════════════════════════════════════════════
create table journey_runs (
  id            uuid primary key default uuid_generate_v4(),
  journey_id    uuid not null references journeys(id) on delete cascade,
  household_id  uuid references households(id) on delete cascade,
  trip_id       uuid references trips(id) on delete cascade,
  status        text default 'pending',    -- 'pending' | 'queued' | 'sent' | 'skipped' | 'failed'
  result        jsonb default '{}',
  fired_at      timestamptz default now(),
  resolved_at   timestamptz
);
create index journey_runs_journey on journey_runs(journey_id);
create index journey_runs_household on journey_runs(household_id);
create index journey_runs_status on journey_runs(status);

-- ════════════════════════════════════════════════════════════════════════
--  Bootstrap: a default agency for the MVP
-- ════════════════════════════════════════════════════════════════════════
insert into agencies (id, name, slug, brand_color, timezone)
values (
  '00000000-0000-0000-0000-000000000001'::uuid,
  'Travelgenix CRM Demo',
  'demo',
  '#1B2B5B',
  'Europe/London'
)
on conflict (slug) do nothing;

-- A default user (Andy)
insert into users (id, agency_id, email, full_name, role)
values (
  '00000000-0000-0000-0000-000000000002'::uuid,
  '00000000-0000-0000-0000-000000000001'::uuid,
  'andy@travelgenix.io',
  'Andy Speight',
  'admin'
)
on conflict do nothing;

-- ════════════════════════════════════════════════════════════════════════
--  Done. Schema is live.
--
--  Next step (day 2): seed realistic demo data — 30 households, 50 trips,
--  100+ interactions. We do that via the app, not raw SQL, so we exercise
--  the data layer as we build it.
-- ════════════════════════════════════════════════════════════════════════
