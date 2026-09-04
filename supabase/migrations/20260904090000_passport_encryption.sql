-- ─────────────────────────────────────────────────────────────────────────
-- Passport numbers: encrypted at rest, and access recorded.
--
-- The schema has carried `contacts.passport_number text -- encrypted in phase 2`
-- since day one, and nothing has ever written to it: the validator refuses the
-- field (lib/contacts/validate) precisely so a plaintext number could never be
-- stored while the encryption waited for a key. This migration is phase 2.
--
-- TWO CONTROLS, at two different layers.
--
-- 1. THE APPLICATION encrypts with AES-256-GCM before the value ever reaches
--    the database (lib/crypto/field). The key lives only in the application's
--    environment, so a leaked service-role key, a copied backup or an
--    over-broad support query yields ciphertext. Each value is bound to its
--    agency, its contact and its field name, so a ciphertext cannot be moved
--    between rows or tenants and still read.
--
-- 2. THE DATABASE refuses to store anything that is not encrypted. The check
--    below is the backstop for the case the application layer cannot cover:
--    a future code path, a migration, a well-meant manual UPDATE. If the
--    encryption is ever bypassed the write FAILS rather than quietly landing a
--    passport number in the clear. Verified before applying: zero rows carry a
--    passport number today, so this constraint cannot break existing data.
--
-- Passport EXPIRY and COUNTRY stay in the clear on purpose: the expiry drives
-- the risk score, compliance roll-ups, the Suggest feed and the
-- passport_expiring journey trigger, all of which compare and sort across
-- every contact. Encrypting a date that is far less abusable than the number,
-- and breaking four features to do it, would be theatre.
-- ─────────────────────────────────────────────────────────────────────────

-- A stored passport number must carry a scheme marker ("v2:…"), which only the
-- encrypting code produces. Anything else — a bare number pasted in by hand —
-- is rejected by the database itself.
alter table contacts drop constraint if exists contacts_passport_number_encrypted;
alter table contacts add constraint contacts_passport_number_encrypted
  check (passport_number is null or passport_number ~ '^v[0-9]+:');

comment on column contacts.passport_number is
  'AES-256-GCM ciphertext, bound to (agency_id, contact id, field). Never plaintext: see lib/crypto/field. Read only through the audited reveal path.';

-- ─────────────────────────────────────────────────────────────────────────
-- Who looked, and when.
--
-- Encryption answers "can an outsider read this". This table answers the
-- question a data-protection audit actually asks: which of YOUR people opened
-- a passport number, for whom, and when. Every reveal writes a row before the
-- value is returned, so a read that happened cannot be unrecorded.
--
-- Rows follow the contact: erasing a traveller erases the trail about them,
-- consistent with every other table here.
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists passport_access (
  id          uuid primary key default uuid_generate_v4(),
  agency_id   uuid not null references agencies(id) on delete cascade,
  contact_id  uuid not null references contacts(id) on delete cascade,
  -- The Control identity that acted. Null in single-tenant mode, where the
  -- access gate is the only identity there is.
  actor_email text,
  -- 'reveal' (the number was shown), 'set' (a number was stored or replaced),
  -- 'clear' (a number was removed).
  action      text not null check (action in ('reveal', 'set', 'clear')),
  ip          text,
  occurred_at timestamptz not null default now()
);

create index if not exists passport_access_contact
  on passport_access (contact_id, occurred_at desc);
create index if not exists passport_access_agency
  on passport_access (agency_id, occurred_at desc);

-- RLS on, no policy: written and read only by the service-role client, like
-- cron_runs and portal_login_tokens. Every other caller — the published anon
-- key included — is denied.
alter table passport_access enable row level security;
