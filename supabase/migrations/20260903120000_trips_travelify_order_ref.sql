-- ─────────────────────────────────────────────────────────────────────────
-- Trips: the Travelify booking reference
--
-- Travelify is the source of truth for bookings, payments, balances and
-- documents; the CRM models none of that. To show a traveller their account
-- in the customer portal, the CRM looks the order up in Travelify the way the
-- My Booking widget does: booking reference + lead traveller email +
-- departure date. `reference` remains the CRM's own TG-2026-001 number; this
-- column carries Travelify's.
-- ─────────────────────────────────────────────────────────────────────────

alter table trips add column if not exists travelify_order_ref text;

comment on column trips.travelify_order_ref is
  'Travelify booking (order) reference. With the lead traveller email and depart_date it looks the live order up for payments, balance and documents.';
