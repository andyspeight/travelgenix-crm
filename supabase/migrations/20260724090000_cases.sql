-- ─────────────────────────────────────────────────────────────────────────
-- Service cases (blueprint §11)
--
-- Proper case management, not just notes and tasks. The signature rule is
-- TRAVEL-AWARE PRIORITY (differentiator 5): a customer stranded overseas
-- automatically outranks a routine post-trip question. Priority is computed
-- deterministically in lib/cases/priority.ts from the case type and the
-- REAL travel context (travelling now, days to departure, children in the
-- party, vulnerable-traveller flags, trip value) — and it explains itself
-- in priority_reason.
--
-- SLA: each priority carries a resolution target; sla_due_at is stamped at
-- open time and the /service queue runs a countdown against it, reusing the
-- same clock the enquiries screen uses.
--
-- case_type stays text (whitelisted in code) so new types don't need a
-- migration. RLS stays disabled for the MVP like the rest of the schema.
-- ─────────────────────────────────────────────────────────────────────────

do $$ begin
  create type case_status as enum ('open', 'in_progress', 'waiting', 'resolved', 'closed');
exception when duplicate_object then null; end $$;

create table if not exists cases (
  id               uuid primary key default uuid_generate_v4(),
  agency_id        uuid not null references agencies(id) on delete cascade,
  household_id     uuid references households(id) on delete set null,
  trip_id          uuid references trips(id) on delete set null,

  case_type        text not null,            -- whitelist lives in lib/cases/priority.ts
  subject          text not null,
  detail           text,

  status           case_status not null default 'open',

  -- travel-aware priority, computed server-side at open time
  priority         int not null default 3,   -- 1 = act now … 4 = routine
  priority_reason  text,

  opened_at        timestamptz not null default now(),
  sla_due_at       timestamptz,
  resolved_at      timestamptz,
  resolution       text,

  owner_user_id    uuid references users(id) on delete set null,

  created_at       timestamptz default now(),
  updated_at       timestamptz default now()
);

create index if not exists cases_agency_status on cases (agency_id, status, priority, sla_due_at);
create index if not exists cases_household on cases (household_id) where household_id is not null;
create index if not exists cases_trip on cases (trip_id) where trip_id is not null;

drop trigger if exists cases_updated_at on cases;
create trigger cases_updated_at before update on cases
  for each row execute function set_updated_at();
