-- Row-level security: the tenant boundary, enforced by the database.
--
-- WHY THIS MATTERS TODAY, not just for multi-tenancy: the anon key is
-- published to the browser (NEXT_PUBLIC_SUPABASE_ANON_KEY). With RLS off,
-- anyone holding it can read or write every row directly against the API,
-- bypassing the app entirely. These policies close that.
--
-- HOW IT WORKS: each policy asks for an agency_id claim on the caller's JWT.
-- Nothing in this app talks to Supabase from the browser, so no legitimate
-- caller presents the anon key: with these policies live, the published key
-- can read nothing and write nothing. That is the hole closed.
--
-- The server reaches the database with the SERVICE-ROLE key, which bypasses
-- RLS by design. The tenant boundary for app traffic is therefore held by the
-- per-request agency filter every query carries (lib/auth/session), with
-- lib/supabase/tenant-filters.test.ts failing the build if a query on a
-- tenant table is ever left unnarrowed.
--
-- The claim-based policies are not decoration: they are what denies anon, and
-- they become full enforcement for app traffic the moment a shared HS256
-- signing secret exists (this project has moved to asymmetric signing keys,
-- whose private half Supabase does not expose, so tokens cannot be minted
-- here today).
--
-- ORDER OF OPERATIONS — READ BEFORE APPLYING:
--   1. set SUPABASE_SERVICE_ROLE_KEY in Vercel,
--   2. deploy,
--   3. then run this migration.
-- Applying it before step 1 leaves the app on the anon key, which every
-- policy correctly refuses — i.e. an empty CRM.

-- The claim, as a uuid. NULL when there is no token or no claim, and a
-- comparison against NULL is never true, so "no token" means "no rows".
create or replace function public.current_agency_id()
returns uuid
language sql
stable
as $$
  select nullif(
    coalesce(
      current_setting('request.jwt.claims', true)::jsonb ->> 'agency_id',
      ''
    ),
    ''
  )::uuid
$$;

-- Every tenant table: enable RLS, then one policy covering all commands.
-- USING governs which rows are visible to read/update/delete; WITH CHECK
-- governs what may be written, so a row can never be inserted into, or moved
-- to, another agency.
do $$
declare
  t text;
  tenant_tables text[] := array[
    'households', 'contacts', 'suppliers', 'trips', 'interactions',
    'tasks', 'notes', 'journeys', 'segments', 'enquiries',
    'events', 'quotes', 'consents', 'cases', 'email_sends',
    'email_suppressions', 'users'
  ];
begin
  foreach t in array tenant_tables loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists tenant_isolation on public.%I', t);
    execute format(
      'create policy tenant_isolation on public.%I
         for all
         using (agency_id = public.current_agency_id())
         with check (agency_id = public.current_agency_id())', t);
  end loop;
end $$;

-- Children that carry no agency_id of their own: scope them through their
-- parent, so they inherit exactly the same boundary.
alter table public.preferences enable row level security;
drop policy if exists tenant_isolation on public.preferences;
create policy tenant_isolation on public.preferences
  for all
  using (exists (
    select 1 from public.households h
    where h.id = preferences.household_id
      and h.agency_id = public.current_agency_id()))
  with check (exists (
    select 1 from public.households h
    where h.id = preferences.household_id
      and h.agency_id = public.current_agency_id()));
alter table public.trip_passengers enable row level security;
drop policy if exists tenant_isolation on public.trip_passengers;
create policy tenant_isolation on public.trip_passengers
  for all
  using (exists (
    select 1 from public.trips tr
    where tr.id = trip_passengers.trip_id
      and tr.agency_id = public.current_agency_id()))
  with check (exists (
    select 1 from public.trips tr
    where tr.id = trip_passengers.trip_id
      and tr.agency_id = public.current_agency_id()));

alter table public.trip_components enable row level security;
drop policy if exists tenant_isolation on public.trip_components;
create policy tenant_isolation on public.trip_components
  for all
  using (exists (
    select 1 from public.trips tr
    where tr.id = trip_components.trip_id
      and tr.agency_id = public.current_agency_id()))
  with check (exists (
    select 1 from public.trips tr
    where tr.id = trip_components.trip_id
      and tr.agency_id = public.current_agency_id()));

alter table public.journey_runs enable row level security;
drop policy if exists tenant_isolation on public.journey_runs;
create policy tenant_isolation on public.journey_runs
  for all
  using (exists (
    select 1 from public.journeys j
    where j.id = journey_runs.journey_id
      and j.agency_id = public.current_agency_id()))
  with check (exists (
    select 1 from public.journeys j
    where j.id = journey_runs.journey_id
      and j.agency_id = public.current_agency_id()));

-- The agencies table keys on id rather than agency_id: you may see your own
-- agency and nobody else's. Control's client -> agency mapping is read with
-- the service-role key, which bypasses this by design.
alter table public.agencies enable row level security;
drop policy if exists tenant_isolation on public.agencies;
create policy tenant_isolation on public.agencies
  for all
  using (id = public.current_agency_id())
  with check (id = public.current_agency_id());
