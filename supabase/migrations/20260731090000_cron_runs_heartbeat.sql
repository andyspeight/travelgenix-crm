-- The nightly run's heartbeat.
-- (Applied live 31 Jul 2026 — recorded here so this folder is the truth.)
--
-- A schedule that silently stops looks exactly like a schedule with nothing
-- to do. This row is how the health check tells the difference, so it is
-- written on failure as well as success.

create table if not exists cron_runs (
  id uuid primary key default gen_random_uuid(),
  job text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'ok' check (status in ('ok', 'error')),
  agencies integer not null default 0,
  actions integer not null default 0,
  error text,
  detail jsonb
);
create index if not exists cron_runs_job_started_idx on cron_runs (job, started_at desc);
