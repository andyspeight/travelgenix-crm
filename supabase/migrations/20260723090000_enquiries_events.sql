-- ─────────────────────────────────────────────────────────────────────────
-- Enquiries + the event spine
--
-- ENQUIRIES is the structured front door of the lifecycle (blueprint §3/§6):
-- the customer's request captured as data, not prose. It keeps the customer's
-- ORIGINAL WORDING verbatim (the blueprint's rule), an optional AI summary,
-- and four SEPARATE deterministic qualification scores in `scores` jsonb —
-- never one mysterious number. The first-response clock lives here too:
-- received_at → first_response_due_at → first_response_at.
--
-- An enquiry may arrive before we know who the customer is, so household_id
-- is nullable; converting an enquiry creates (or links) the household and a
-- trip, and stamps trip_id.
--
-- EVENTS is the shared-data-loop spine (blueprint §2): typed facts like
-- 'enquiry.created' that CRM, Travelify and Luna Marketing will exchange.
-- We start by emitting our own; external producers plug into the same table
-- (source 'travelify' / 'luna_marketing') when their hooks exist. Generic
-- subject_type/subject_id rather than N foreign keys, payload is jsonb.
--
-- RLS stays disabled for the MVP like the rest of the schema (single-tenant,
-- agency_id scoping in code).
-- ─────────────────────────────────────────────────────────────────────────

do $$ begin
  create type enquiry_status as enum ('new', 'responded', 'converted', 'closed');
exception when duplicate_object then null; end $$;

create table if not exists enquiries (
  id                    uuid primary key default uuid_generate_v4(),
  agency_id             uuid not null references agencies(id) on delete cascade,
  household_id          uuid references households(id) on delete set null,
  trip_id               uuid references trips(id) on delete set null,
  status                enquiry_status not null default 'new',

  -- where it came from
  source                text,                    -- 'website' | 'email' | 'phone' | 'walk_in' | 'referral' | 'social' | 'manual'
  channel_preference    text,                    -- how the customer wants to be contacted

  -- who (free-standing until linked/converted to a household)
  contact_name          text,
  contact_email         text,
  contact_phone         text,

  -- what they want, structured
  destination           text,
  depart_date           date,
  date_flexibility      text,                    -- 'fixed' | 'flexible' | 'very_flexible'
  duration_nights       int,
  departure_airport     text,
  adults                int,
  children              int,
  child_ages            text,
  budget                numeric(10, 2),
  budget_basis          text,                    -- 'total' | 'per_person'
  holiday_type          text,                    -- 'beach' | 'city' | 'cruise' | 'ski' | ...
  board_basis           text,
  accommodation         text,
  occasion              text,
  must_haves            text[] default '{}',
  deal_breakers         text[] default '{}',

  -- provenance — the customer's words are kept verbatim, always
  original_wording      text,
  ai_summary            text,
  ai_extracted          boolean default false,   -- fields pre-filled by Luna (then human-reviewed)

  -- qualification: four separate deterministic scores + reasons, computed in
  -- lib/enquiries/scoring.ts. Shape: { likelihood, value, urgency, fit } each
  -- { score: int|null, reason: text }. Null score = insufficient data, said so.
  scores                jsonb,

  -- first-response clock
  received_at           timestamptz not null default now(),
  first_response_due_at timestamptz,
  first_response_at     timestamptz,

  assigned_user_id      uuid references users(id) on delete set null,
  notes                 text,
  lost_reason           text,

  created_at            timestamptz default now(),
  updated_at            timestamptz default now()
);

create index if not exists enquiries_agency_status on enquiries (agency_id, status, received_at desc);
create index if not exists enquiries_household on enquiries (household_id) where household_id is not null;
create index if not exists enquiries_due on enquiries (first_response_due_at) where first_response_at is null;

drop trigger if exists enquiries_updated_at on enquiries;
create trigger enquiries_updated_at before update on enquiries
  for each row execute function set_updated_at();

-- ─── Events — the shared data loop ──────────────────────────────────────

create table if not exists events (
  id            uuid primary key default uuid_generate_v4(),
  agency_id     uuid not null references agencies(id) on delete cascade,
  type          text not null,                   -- 'enquiry.created', 'quote.sent', 'booking.created', ...
  source        text not null default 'crm',     -- 'crm' | 'travelify' | 'luna_marketing'
  subject_type  text,                            -- 'enquiry' | 'trip' | 'household' | 'interaction' | ...
  subject_id    uuid,
  household_id  uuid references households(id) on delete set null,
  payload       jsonb not null default '{}'::jsonb,
  occurred_at   timestamptz not null default now()
);

create index if not exists events_agency_time on events (agency_id, occurred_at desc);
create index if not exists events_type on events (agency_id, type, occurred_at desc);
create index if not exists events_subject on events (subject_type, subject_id);
