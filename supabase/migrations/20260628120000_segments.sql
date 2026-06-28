-- ─────────────────────────────────────────────────────────────────────────
-- Saved segments
--
-- Persists a named smart-segment so an agent can re-open it from a chip. We
-- store both the original natural-language query (for display / re-resolution)
-- and the resolved Token[] (so the segment replays identically even if the
-- parser changes later). RLS stays disabled for the MVP, like the rest of the
-- schema (single-tenant, no auth yet).
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists segments (
  id          uuid primary key default uuid_generate_v4(),
  agency_id   uuid not null references agencies(id) on delete cascade,
  label       text not null,
  query       text,
  tokens      jsonb not null default '[]'::jsonb,
  created_by  uuid references users(id) on delete set null,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

create index if not exists segments_agency_idx on segments (agency_id, created_at desc);
