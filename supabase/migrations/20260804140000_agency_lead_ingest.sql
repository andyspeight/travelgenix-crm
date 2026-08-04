-- Per-agency credentials for the widget lead ingest.
--
-- A website widget (tg-widgets) can't hold a Control sign-in, so the ingest
-- endpoint POST /api/widget/lead authenticates the way the email webhook does:
-- a shared secret, checked in the route. But leads are PER AGENCY, so the
-- secret is per agency too.
--
--   lead_ingest_key    — the public identifier the widget sends (begins wlk_).
--                        Names the agency; safe to store in the widget config.
--   lead_ingest_secret — the HMAC secret the widget signs the body with and the
--                        CRM verifies. Never leaves a server.
--
-- Both null until an agency turns lead capture on. A key with no secret, or a
-- request whose HMAC doesn't verify, is refused.

alter table agencies add column if not exists lead_ingest_key text unique;
alter table agencies add column if not exists lead_ingest_secret text;
