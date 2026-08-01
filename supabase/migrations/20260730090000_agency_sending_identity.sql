-- Per-agency sending identity.
-- (Applied live 30 Jul 2026 — recorded here so this folder is the truth.)
--
-- Email from the CRM is from the AGENCY, not from Luna. A customer should
-- see their travel agent's name and address, because that is who they are
-- talking to. The platform address is a fallback for agencies who have not
-- verified a domain yet — sending as an unverified domain is how you land in
-- spam, so email_sender_verified gates it rather than hope doing so.

alter table agencies add column if not exists email_from_address    text;
alter table agencies add column if not exists email_from_name       text;
alter table agencies add column if not exists email_reply_to        text;
alter table agencies add column if not exists email_sender_verified boolean not null default false;
