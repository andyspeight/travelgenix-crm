-- Which provider carried each send (sendgrid = transactional, brevo =
-- marketing). Recorded per row because the routing is config-dependent —
-- the audit should say what actually happened, not what the config implies.
alter table email_sends add column if not exists provider text;
