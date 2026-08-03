-- Team invitations — a shared record of who should have access, and as what.
--
-- Luna Work does not own sign-in: Control does. So an invitation here does NOT
-- grant access on its own — a teammate gets in when Control maps them to this
-- agency. What was missing was anywhere to record the DECISION: "Priya should
-- join as an admin", visible to the whole team, with a sign-in link sent to
-- her. Without it the only "invite" was a Slack message and a hope.
--
-- The role recorded here is the role they SHOULD have. Today Control's grant is
-- what the app reads at sign-in; when per-seat roles go live this table is
-- where the intended role already lives, so nothing has to be re-decided.
--
-- INVITES ARE REVOKED, NOT DELETED, so "who did we invite, and did someone
-- pull it" stays answerable. One row per (agency, email): re-inviting a
-- revoked address flips it back to pending rather than stacking duplicates.

create table if not exists agency_invitations (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references agencies(id) on delete cascade,
  -- Stored lower-cased and trimmed by the API so the unique constraint is
  -- case-insensitive in practice; two invites to the same person are one row.
  email text not null,
  role text not null default 'member' check (role in ('member', 'admin', 'owner')),
  status text not null default 'pending' check (status in ('pending', 'revoked')),
  -- Who sent it, for the record. An email rather than a user id because Luna
  -- Work keeps no users of its own — the identity is Control's.
  invited_by_email text,
  invited_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique (agency_id, email)
);

create index if not exists agency_invitations_agency_idx
  on agency_invitations (agency_id, status);

-- Same boundary as every other tenant table: the published anon key reads
-- nothing. Who an agency has invited is that agency's business alone.
alter table agency_invitations enable row level security;
drop policy if exists tenant_isolation on agency_invitations;
create policy tenant_isolation on agency_invitations
  for all
  using (agency_id = public.current_agency_id())
  with check (agency_id = public.current_agency_id());
