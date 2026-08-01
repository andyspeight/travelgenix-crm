-- Replies and engagement: the half of the conversation the CRM never saw.
--
-- Until now email was one-directional. We recorded what we sent and whether
-- it bounced; a customer answering it was invisible to the system. The
-- enquiry still read "waiting", the chase carried on, and the only thing that
-- stopped either was an agent spotting it in their own inbox.
--
-- Two additions:
--
--   1. email_sends grows engagement columns — delivered, opened, clicked —
--      folded in from the same provider webhook that already handles bounces.
--      Counts, not booleans, because "opened four times" and "opened once"
--      are different facts. See lib/email/engagement.ts for why an open is
--      reported as a hint and never as proof.
--
--   2. email_inbound records EVERY reply we accept, matched or not. agency_id
--      is nullable on purpose: when we cannot tell whose customer it is, the
--      message is still kept, flagged, and countable — a customer's reply
--      vanishing quietly is the worst outcome available.

alter table email_sends add column if not exists delivered_at     timestamptz;
alter table email_sends add column if not exists first_opened_at  timestamptz;
alter table email_sends add column if not exists open_count       integer not null default 0;
alter table email_sends add column if not exists first_clicked_at timestamptz;
alter table email_sends add column if not exists click_count      integer not null default 0;
alter table email_sends add column if not exists last_event_at    timestamptz;
-- When they answered this specific message. Set by the inbound route, so the
-- audit row and the timeline agree about what happened.
alter table email_sends add column if not exists replied_at       timestamptz;

create table if not exists email_inbound (
  id uuid primary key default gen_random_uuid(),
  -- Nullable: an unmatched reply belongs to nobody until a human says so.
  agency_id uuid references agencies(id) on delete cascade,
  household_id uuid references households(id) on delete set null,
  contact_id uuid references contacts(id) on delete set null,
  enquiry_id uuid references enquiries(id) on delete set null,
  -- The timeline entry this became, and the send it answers.
  interaction_id uuid references interactions(id) on delete set null,
  reply_to_send_id uuid references email_sends(id) on delete set null,

  from_email text not null,
  from_name text,
  to_email text,
  subject text,
  -- Their words with the quoted original stripped, and their words entire.
  body text,
  raw_body text,

  message_id text,
  in_reply_to text,

  -- How confident we are about who this is: an exact message match, a guess
  -- from the sender's address, or nothing at all. Stored, not inferred, so
  -- the confidence stays visible.
  matched_by text not null check (matched_by in ('thread', 'address', 'none')),
  match_reason text,
  -- An out-of-office is recorded but is not an answer (lib/email/inbound.ts).
  is_auto_reply boolean not null default false,

  received_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists email_inbound_agency_received_idx
  on email_inbound (agency_id, received_at desc);
create index if not exists email_inbound_household_idx
  on email_inbound (household_id);
-- The pile that needs a human. Small by design; loud if it is not.
create index if not exists email_inbound_unmatched_idx
  on email_inbound (received_at desc) where matched_by = 'none';
-- Providers retry. The same message must not land on the timeline twice.
create unique index if not exists email_inbound_message_id_key
  on email_inbound (message_id) where message_id is not null;

-- Same boundary as every other tenant table: the published anon key can read
-- nothing here. An unmatched row has no agency_id, so it matches no claim at
-- all — which is correct, since it belongs to no tenant yet.
alter table email_inbound enable row level security;
drop policy if exists tenant_isolation on email_inbound;
create policy tenant_isolation on email_inbound
  for all
  using (agency_id = public.current_agency_id())
  with check (agency_id = public.current_agency_id());
