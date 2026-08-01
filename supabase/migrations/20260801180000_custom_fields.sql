-- Custom fields — the things this agency records that no other agency does.
--
-- A loyalty number, the wedding date, a corporate account code, which of the
-- two offices looks after them. Every agency has three or four, none of them
-- predictable, and without somewhere to put them the answer is a spreadsheet
-- beside the CRM.
--
-- DEFINITIONS in their own table, VALUES in a jsonb column on the record.
-- That way every screen that already loads a customer gets their custom
-- fields for free: no join, no second query, no page rendering half a record
-- while it waits. Filtering later can use a GIN index on the column.
--
-- ENTITY IS 'household' ONLY for now, deliberately. It is the one record with
-- a detail screen to put fields on. Adding 'trip' or 'contact' is a one-line
-- change to this constraint plus a column, and should happen when there is a
-- screen for them rather than before.
--
-- FIELDS ARE ARCHIVED, NEVER DELETED. Dropping a definition would orphan
-- every value recorded under it, silently. Archiving takes it off the form
-- and keeps what was written, which the app then shows marked as no longer in
-- use. The same reasoning is why a field's TYPE cannot be changed after
-- creation (enforced in the API, not here): reinterpreting existing values is
-- a data loss nobody notices until they need the data.

create table if not exists custom_fields (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references agencies(id) on delete cascade,
  entity text not null default 'household' check (entity in ('household')),
  -- Derived from the label once, then frozen: renaming a field must never
  -- orphan the values stored under its old key.
  key text not null,
  label text not null,
  type text not null check (type in ('text', 'number', 'date', 'select', 'multi_select', 'checkbox')),
  options text[] not null default '{}',
  help text,
  position integer not null default 0,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (agency_id, entity, key)
);

create index if not exists custom_fields_agency_idx on custom_fields (agency_id, entity, position);

-- The values. Default '{}' so every existing customer is immediately valid.
alter table households add column if not exists custom jsonb not null default '{}'::jsonb;

-- Same boundary as every other tenant table: the published anon key reads
-- nothing. A field definition names how an agency runs its business.
alter table custom_fields enable row level security;
drop policy if exists tenant_isolation on custom_fields;
create policy tenant_isolation on custom_fields
  for all
  using (agency_id = public.current_agency_id())
  with check (agency_id = public.current_agency_id());
