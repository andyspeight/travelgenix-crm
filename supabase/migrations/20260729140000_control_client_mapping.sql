-- Map a Control client (the agency, as Control knows it) to a Luna Work
-- agency row. Control's Clients table is the source of truth for WHO an
-- agency is; this column is the join that lets a Control session resolve to
-- the right tenant's data here.
--
-- Nullable and unique: an agency that hasn't been linked yet simply has no
-- mapping (and no Control user can reach it), and one Control client can
-- never map to two agencies.

alter table agencies add column if not exists control_client_id text;

create unique index if not exists agencies_control_client_id_key
  on agencies (control_client_id)
  where control_client_id is not null;
