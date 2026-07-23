-- ─────────────────────────────────────────────────────────────────────────
-- Consent v2 — the per-channel consent ledger
--
-- The blueprint's rule (§3): consent is not a single marketing tick box.
-- Track each channel separately, and record the SOURCE, WORDING and DATE of
-- every change — evidence, not just state (PECR requires consent per
-- channel/purpose, and the evidence trail is what makes it defensible).
--
-- Design: APPEND-ONLY ledger. A consent change is a new row; the current
-- state of (contact, channel) is simply the latest row. Nothing is ever
-- updated or deleted, so the audit trail is the table itself.
--
-- Channels: the marketing channels the blueprint names, plus profiling.
-- Operational messages (booking confirmations, balance reminders) do NOT
-- need marketing consent and are not gated by this table.
--
-- The legacy contacts.marketing_opt_in boolean stays in sync for the email
-- channel (older surfaces read it); the ledger is authoritative.
--
-- RLS stays disabled for the MVP like the rest of the schema.
-- ─────────────────────────────────────────────────────────────────────────

do $$ begin
  create type consent_channel as enum (
    'email', 'sms', 'whatsapp', 'phone', 'post', 'profiling'
  );
exception when duplicate_object then null; end $$;

create table if not exists consents (
  id            uuid primary key default uuid_generate_v4(),
  agency_id     uuid not null references agencies(id) on delete cascade,
  contact_id    uuid not null references contacts(id) on delete cascade,
  household_id  uuid references households(id) on delete set null,

  channel       consent_channel not null,
  granted       boolean not null,

  -- the evidence
  source        text not null default 'agent_recorded',  -- 'webform' | 'verbal' | 'email_reply' | 'preference_centre' | 'import' | 'agent_recorded' | 'legacy_flag_migration'
  wording       text,                                    -- the exact wording the customer saw or heard
  evidence      text,                                    -- pointer: form URL, call reference, email id
  recorded_by   text,                                    -- who recorded it (free text until auth lands)

  occurred_at   timestamptz not null default now(),
  created_at    timestamptz default now()
);

create index if not exists consents_contact_channel on consents (contact_id, channel, occurred_at desc);
create index if not exists consents_agency_time on consents (agency_id, occurred_at desc);
create index if not exists consents_household on consents (household_id) where household_id is not null;

-- ─── Backfill from the legacy flag ──────────────────────────────────────
-- One email-channel grant per contact whose legacy marketing_opt_in is true.
-- Contacts without the flag get NO row: unknown is not refusal, but unknown
-- does not permit marketing either — exactly the PECR-safe default.
insert into consents (agency_id, contact_id, household_id, channel, granted, source, wording, occurred_at)
select
  c.agency_id,
  c.id,
  c.household_id,
  'email',
  true,
  'legacy_flag_migration',
  'Migrated from the single marketing opt-in flag. Original wording predates the per-channel ledger.',
  coalesce(c.marketing_opt_in_at, c.created_at, now())
from contacts c
where c.marketing_opt_in = true
  and not exists (
    select 1 from consents k where k.contact_id = c.id and k.channel = 'email'
  );
