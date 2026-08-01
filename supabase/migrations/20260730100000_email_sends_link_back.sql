-- Let a send point back at what it was.
-- (Applied live 30 Jul 2026 — recorded here so this folder is the truth.)
--
-- Without these, a bounce could suppress the address but could not correct
-- the record: the timeline still showed an email the customer never got, and
-- the enquiry still read "responded". A pointer each way fixes both.

alter table email_sends add column if not exists provider       text;
alter table email_sends add column if not exists interaction_id uuid references interactions(id) on delete set null;
alter table email_sends add column if not exists enquiry_id     uuid references enquiries(id) on delete set null;
