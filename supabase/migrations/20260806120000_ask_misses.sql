-- Ask Luna miss log.
--
-- When a user asks Luna something and the router finds no tool that fits, the
-- question today just vanishes: Luna returns a canned "can't answer that yet"
-- and nothing is recorded. That leaves us blind to what people actually want
-- to ask and can't — which is the single most useful backlog for deciding
-- which query tool to build next.
--
-- This table captures those misses: the question text, and (if the model gave
-- one) its own plain-text reply. It is agency-scoped, holds only what the user
-- typed into the Ask box — never a customer row — and is written best-effort:
-- logging a miss must never break answering the next question.

create table if not exists ask_misses (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references agencies(id) on delete cascade,
  question text not null,
  router_text text,
  created_at timestamptz not null default now()
);

-- The backlog view: an agency's most recent misses first.
create index if not exists ask_misses_agency_idx on ask_misses (agency_id, created_at desc);

-- Same tenant boundary as every other table: denies the published anon key,
-- and scopes app traffic to one agency. Writes come from the server on the
-- service-role key (which sets agency_id explicitly on the row).
alter table ask_misses enable row level security;
drop policy if exists tenant_isolation on ask_misses;
create policy tenant_isolation on ask_misses for all
  using (agency_id = public.current_agency_id())
  with check (agency_id = public.current_agency_id());
