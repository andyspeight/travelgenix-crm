-- ─────────────────────────────────────────────────────────────────────────
-- Quotes
--
-- The CRM's quote object (blueprint §3): the relationship-side record of a
-- priced proposal. Travelify stays the source of truth for pricing and
-- availability — `reference` points at its quote when one exists. What the
-- CRM owns is the SALES story: versions, when it was sent, when it expires,
-- whether the customer looked at it, what they said, and why it was declined.
--
-- Quote Rescue (blueprint differentiator 3) reads these rows with
-- lib/quotes/rescue.ts — deterministic at-risk signals, no AI in the maths.
--
-- Price changes are modelled as versions: a revision is a NEW row with
-- version+1 on the same trip, and the old row moves to 'superseded'. History
-- stays intact, "price has changed twice" is a count.
--
-- RLS stays disabled for the MVP like the rest of the schema.
-- ─────────────────────────────────────────────────────────────────────────

do $$ begin
  create type quote_status as enum (
    'draft', 'sent', 'viewed', 'accepted', 'declined', 'expired', 'superseded'
  );
exception when duplicate_object then null; end $$;

create table if not exists quotes (
  id               uuid primary key default uuid_generate_v4(),
  agency_id        uuid not null references agencies(id) on delete cascade,
  trip_id          uuid not null references trips(id) on delete cascade,
  household_id     uuid references households(id) on delete set null,

  reference        text,                     -- Travelify quote reference, when it exists
  version          int not null default 1,
  status           quote_status not null default 'draft',

  total_price      numeric(10, 2),
  deposit          numeric(10, 2),
  expected_margin  numeric(10, 2),
  currency         text not null default 'GBP',

  options_summary  text,                     -- what was included / options presented

  sent_at          timestamptz,
  expires_at       timestamptz,
  viewed_at        timestamptz,              -- most recent customer view
  view_count       int not null default 0,

  customer_response text,                    -- what the customer actually said
  declined_reason  text,
  notes            text,

  created_at       timestamptz default now(),
  updated_at       timestamptz default now()
);

create index if not exists quotes_agency_status on quotes (agency_id, status, sent_at desc);
create index if not exists quotes_trip on quotes (trip_id, version desc);
create index if not exists quotes_household on quotes (household_id) where household_id is not null;

drop trigger if exists quotes_updated_at on quotes;
create trigger quotes_updated_at before update on quotes
  for each row execute function set_updated_at();
