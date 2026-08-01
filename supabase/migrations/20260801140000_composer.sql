-- The composer: formatting and attachments.
--
-- Two columns and a private bucket.
--
-- body_html is what the customer's mail client renders. body stays the plain
-- text and stays authoritative: it is what the timeline shows, what a
-- plain-text reader receives, and what an AI rewrite works on. The two are
-- built from the same document (lib/email/rich-text.ts) so they cannot drift.
--
-- attachments is a record of what went with the message, not the files
-- themselves. The bytes live in storage under the agency's own prefix, and
-- the send path reads them from there rather than trusting anything the
-- browser hands over.

alter table email_sends add column if not exists body_html   text;
alter table email_sends add column if not exists attachments jsonb not null default '[]'::jsonb;

-- A private bucket. Nothing in it is ever served publicly: an itinerary is a
-- customer's travel plans, their names and often their address, and a
-- guessable public URL is how that ends up indexed.
insert into storage.buckets (id, name, public, file_size_limit)
values ('email-attachments', 'email-attachments', false, 5242880)
on conflict (id) do update set public = false, file_size_limit = 5242880;

-- No storage policies are created on purpose. Every read and write goes
-- through the server on the service-role key, which checks the agency prefix
-- itself. Adding a permissive policy here would open a second door to the
-- same files that nothing in the app needs.
