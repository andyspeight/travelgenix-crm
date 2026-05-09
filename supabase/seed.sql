-- ════════════════════════════════════════════════════════════════════════
--  Travelgenix CRM — Seed Data (fallback for /api/seed)
--  Generated 2026-05-09T15:22:35.872Z
--  Run via Supabase SQL Editor if the API endpoint isn't working.
--  Idempotent — checks if households exist first.
-- ════════════════════════════════════════════════════════════════════════

do $$
declare
  v_existing int;
begin
  select count(*) into v_existing from households where agency_id = '00000000-0000-0000-0000-000000000001';
  if v_existing > 0 then
    raise notice 'Households already exist (% rows). Skipping seed.', v_existing;
    return;
  end if;
end $$;

-- Suppliers
insert into suppliers (agency_id, name, category, rating, flags) values ('00000000-0000-0000-0000-000000000001', 'Jet2 Holidays', 'tour_operator', 4.6, '{}'::text[]);
insert into suppliers (agency_id, name, category, rating, flags) values ('00000000-0000-0000-0000-000000000001', 'TUI', 'tour_operator', 4.2, '{}'::text[]);
insert into suppliers (agency_id, name, category, rating, flags) values ('00000000-0000-0000-0000-000000000001', 'BA Holidays', 'tour_operator', 4.4, '{}'::text[]);
insert into suppliers (agency_id, name, category, rating, flags) values ('00000000-0000-0000-0000-000000000001', 'Hotelbeds', 'hotel', 4, '{}'::text[]);
insert into suppliers (agency_id, name, category, rating, flags) values ('00000000-0000-0000-0000-000000000001', 'WebBeds', 'hotel', 4.1, '{}'::text[]);
insert into suppliers (agency_id, name, category, rating, flags) values ('00000000-0000-0000-0000-000000000001', 'InterMyt', 'transfer', 4.7, '{"preferred"}'::text[]);
insert into suppliers (agency_id, name, category, rating, flags) values ('00000000-0000-0000-0000-000000000001', 'Olympic Holidays Transfers', 'transfer', 2.8, '{"avoid"}'::text[]);
insert into suppliers (agency_id, name, category, rating, flags) values ('00000000-0000-0000-0000-000000000001', 'Holiday Taxis', 'transfer', 4.3, '{}'::text[]);
insert into suppliers (agency_id, name, category, rating, flags) values ('00000000-0000-0000-0000-000000000001', 'Jet2 Insurance', 'insurance', 4.5, '{}'::text[]);

-- Household: Sarah & James Thompson
with new_household as (
  insert into households (
    agency_id, display_name, household_type, city, postcode, country, tags,
    notes, customer_since, lifetime_value, trips_count, next_departure, last_booking_at,
    ai_brief, ai_brief_at
  ) values (
    '00000000-0000-0000-0000-000000000001',
    'Sarah & James Thompson',
    'family',
    'Bournemouth',
    'BH1 2AA',
    'GB',
    '{"VIP","Repeat"}'::text[],
    'Bad transfer in Crete 2024 with Olympic Holidays. Switched to InterMyt. Watch the family on every transfer booking.',
    '2019-04-12',
    24580,
    3,
    '2026-05-12',
    '2026-05-12T00:00:00.000Z',
    'Sarah and James are seven-year customers, family of four, two boys (Oliver 12, Henry 9). They book annually in summer, big trips for milestones. They love boutique over mass-market, water-based activities, and good food. Sarah handles all comms; James is quieter but the decision-maker on price.',
    '2026-05-09T15:22:35.872Z'
  ) returning id
)
, ins_contact_0 as (insert into contacts (agency_id, household_id, role, first_name, last_name, email, phone, date_of_birth, passport_expiry, dietary, flags, marketing_opt_in, marketing_opt_in_at, gdpr_consent, gdpr_consent_at) select '00000000-0000-0000-0000-000000000001', id, 'lead', 'Sarah', 'Thompson', 'sarah.thompson@gmail.com', '+44 7700 900123', '1985-06-14', '2029-08-21', null, '{}'::text[], true, '2026-05-09T15:22:35.872Z', true, '2026-05-09T15:22:35.872Z' from new_household returning id)
, ins_contact_1 as (insert into contacts (agency_id, household_id, role, first_name, last_name, email, phone, date_of_birth, passport_expiry, dietary, flags, marketing_opt_in, marketing_opt_in_at, gdpr_consent, gdpr_consent_at) select '00000000-0000-0000-0000-000000000001', id, 'partner', 'James', 'Thompson', 'j.thompson@gmail.com', '+44 7700 900124', '1983-02-08', '2029-08-21', null, '{}'::text[], true, '2026-05-09T15:22:35.872Z', true, '2026-05-09T15:22:35.872Z' from new_household returning id)
, ins_contact_2 as (insert into contacts (agency_id, household_id, role, first_name, last_name, email, phone, date_of_birth, passport_expiry, dietary, flags, marketing_opt_in, marketing_opt_in_at, gdpr_consent, gdpr_consent_at) select '00000000-0000-0000-0000-000000000001', id, 'child', 'Oliver', 'Thompson', null, null, '2014-03-22', '2029-09-14', null, '{}'::text[], false, null, false, null from new_household returning id)
, ins_contact_3 as (insert into contacts (agency_id, household_id, role, first_name, last_name, email, phone, date_of_birth, passport_expiry, dietary, flags, marketing_opt_in, marketing_opt_in_at, gdpr_consent, gdpr_consent_at) select '00000000-0000-0000-0000-000000000001', id, 'child', 'Henry', 'Thompson', null, null, '2017-07-09', '2029-09-14', 'nut allergy', '{"allergy"}'::text[], false, null, false, null from new_household returning id)
, ins_trip_4 as (insert into trips (agency_id, household_id, reference, stage, destination, destination_country, depart_date, return_date, duration_nights, total_value, currency, occasion, notes, source) select '00000000-0000-0000-0000-000000000001', id, 'TG-2026-001', 'travelling'::trip_stage, 'Crete, Greece', 'GR', '2026-05-05', '2026-05-12', 7, 8400, 'GBP', 'family summer', null, 'phone' from new_household returning id)
, ins_trip_5 as (insert into trips (agency_id, household_id, reference, stage, destination, destination_country, depart_date, return_date, duration_nights, total_value, currency, occasion, notes, source) select '00000000-0000-0000-0000-000000000001', id, 'TG-2026-002', 'pre_departure'::trip_stage, 'Maldives — Vakkaru', 'MV', '2026-05-12', '2026-05-19', 7, 12400, 'GBP', 'anniversary', null, 'phone' from new_household returning id)
, ins_trip_6 as (insert into trips (agency_id, household_id, reference, stage, destination, destination_country, depart_date, return_date, duration_nights, total_value, currency, occasion, notes, source) select '00000000-0000-0000-0000-000000000001', id, 'TG-2025-088', 'returned'::trip_stage, 'Banff & Lake Louise, Canada', 'CA', '2025-08-22', '2025-09-06', 14, 9200, 'GBP', 'family summer', null, 'phone' from new_household returning id)
, ins_ix_7 as (insert into interactions (agency_id, household_id, kind, channel, direction, subject, body, body_summary, ai_priority, ai_reason, is_read, is_triaged, occurred_at) select '00000000-0000-0000-0000-000000000001', id, 'email_in'::interaction_kind, 'email', 'inbound', 'Quick question about transfers in Maldives', 'Hi Andy! Really excited for our trip on Tuesday. Quick one — will the speedboat transfer wait if our flight is delayed? We had a nightmare in 2024 when our transfer left without us in Crete and we ended up in a taxi. Don''t want a repeat with the kids and all the bags. Thanks! Sarah', 'Worried about the Maldives speedboat transfer waiting if her flight is delayed, referencing a bad Crete 2024 experience. Wants reassurance, not detail.', 'today', 'Departing Tue · £12,400 trip · referencing past bad experience', false, true, '2026-05-09T15:10:35.872Z' from new_household returning id)
, ins_ix_8 as (insert into interactions (agency_id, household_id, kind, channel, direction, subject, body, body_summary, ai_priority, ai_reason, is_read, is_triaged, occurred_at) select '00000000-0000-0000-0000-000000000001', id, 'email_out'::interaction_kind, 'email', 'outbound', 'Re: Final document pack', 'Sarah, attached are your e-tickets, hotel vouchers, transfer confirmations and travel insurance. Pre-departure call held for tomorrow at 14:00. Andy', null, null, null, true, false, '2026-05-08T23:22:35.872Z' from new_household returning id)
, ins_ix_9 as (insert into interactions (agency_id, household_id, kind, channel, direction, subject, body, body_summary, ai_priority, ai_reason, is_read, is_triaged, occurred_at) select '00000000-0000-0000-0000-000000000001', id, 'chat'::interaction_kind, 'live_chat', 'inbound', 'Anniversary dinner reservation', 'Andy, did Vakkaru confirm the Ithaa Undersea booking for night 3? Want to keep it as a surprise from James.', 'Confirming the anniversary dinner reservation Sarah wants to surprise James with on night 3.', null, null, true, false, '2026-05-05T14:22:35.872Z' from new_household returning id)
, ins_pref_10 as (insert into preferences (household_id, category, value, source) select id, 'style', 'Boutique & small luxury', 'manual' from new_household returning id)
, ins_pref_11 as (insert into preferences (household_id, category, value, source) select id, 'airline', 'BA / Emirates', 'manual' from new_household returning id)
, ins_pref_12 as (insert into preferences (household_id, category, value, source) select id, 'seat', 'Window · together as family', 'manual' from new_household returning id)
, ins_pref_13 as (insert into preferences (household_id, category, value, source) select id, 'room', 'Sea view · adjoining', 'manual' from new_household returning id)
, ins_pref_14 as (insert into preferences (household_id, category, value, source) select id, 'budget', 'Flexible for milestones', 'manual' from new_household returning id)
, ins_pref_15 as (insert into preferences (household_id, category, value, source) select id, 'avoid', 'Olympic Holidays (transfers)', 'manual' from new_household returning id)
select 1 from new_household;

-- Household: Margaret Collins
with new_household as (
  insert into households (
    agency_id, display_name, household_type, city, postcode, country, tags,
    notes, customer_since, lifetime_value, trips_count, next_departure, last_booking_at,
    ai_brief, ai_brief_at
  ) values (
    '00000000-0000-0000-0000-000000000001',
    'Margaret Collins',
    'solo',
    'Poole',
    'BH15 1AB',
    'GB',
    '{"Repeat"}'::text[],
    null,
    '2017-09-01',
    18420,
    2,
    '2026-05-16',
    '2026-05-16T00:00:00.000Z',
    null,
    null
  ) returning id
)
, ins_contact_0 as (insert into contacts (agency_id, household_id, role, first_name, last_name, email, phone, date_of_birth, passport_expiry, dietary, flags, marketing_opt_in, marketing_opt_in_at, gdpr_consent, gdpr_consent_at) select '00000000-0000-0000-0000-000000000001', id, 'lead', 'Margaret', 'Collins', 'margaret.collins@outlook.com', '+44 7700 900245', '1956-11-03', '2028-04-19', null, '{}'::text[], true, '2026-05-09T15:22:35.872Z', true, '2026-05-09T15:22:35.872Z' from new_household returning id)
, ins_trip_1 as (insert into trips (agency_id, household_id, reference, stage, destination, destination_country, depart_date, return_date, duration_nights, total_value, currency, occasion, notes, source) select '00000000-0000-0000-0000-000000000001', id, 'TG-2025-101', 'returned'::trip_stage, 'Cyprus', 'CY', '2025-06-03', '2025-06-10', 7, 1620, 'GBP', null, null, 'phone' from new_household returning id)
, ins_trip_2 as (insert into trips (agency_id, household_id, reference, stage, destination, destination_country, depart_date, return_date, duration_nights, total_value, currency, occasion, notes, source) select '00000000-0000-0000-0000-000000000001', id, 'TG-2026-014', 'pre_departure'::trip_stage, 'Madeira', 'PT', '2026-05-16', '2026-05-23', 7, 1840, 'GBP', null, null, 'phone' from new_household returning id)
, ins_ix_3 as (insert into interactions (agency_id, household_id, kind, channel, direction, subject, body, body_summary, ai_priority, ai_reason, is_read, is_triaged, occurred_at) select '00000000-0000-0000-0000-000000000001', id, 'chat'::interaction_kind, 'live_chat', 'inbound', 'Madeira final docs', 'Hi Andy, I just wanted to check the airport hotel I asked about — the one in Funchal — is that confirmed for the night before our flight back?', 'Checking confirmation of the Funchal airport hotel for her last night.', 'today', 'Departs in 7 days · simple confirmation needed', false, true, '2026-05-09T14:22:35.872Z' from new_household returning id)
select 1 from new_household;

-- Household: Patel Family
with new_household as (
  insert into households (
    agency_id, display_name, household_type, city, postcode, country, tags,
    notes, customer_since, lifetime_value, trips_count, next_departure, last_booking_at,
    ai_brief, ai_brief_at
  ) values (
    '00000000-0000-0000-0000-000000000001',
    'Patel Family',
    'family',
    'Southampton',
    'SO14 7AB',
    'GB',
    '{"High value"}'::text[],
    null,
    '2018-06-22',
    42100,
    2,
    null,
    '2025-11-10T00:00:00.000Z',
    null,
    null
  ) returning id
)
, ins_contact_0 as (insert into contacts (agency_id, household_id, role, first_name, last_name, email, phone, date_of_birth, passport_expiry, dietary, flags, marketing_opt_in, marketing_opt_in_at, gdpr_consent, gdpr_consent_at) select '00000000-0000-0000-0000-000000000001', id, 'lead', 'Rajesh', 'Patel', 'rajesh.patel@hotmail.com', '+44 7700 900567', null, null, null, '{}'::text[], true, '2026-05-09T15:22:35.872Z', true, '2026-05-09T15:22:35.872Z' from new_household returning id)
, ins_contact_1 as (insert into contacts (agency_id, household_id, role, first_name, last_name, email, phone, date_of_birth, passport_expiry, dietary, flags, marketing_opt_in, marketing_opt_in_at, gdpr_consent, gdpr_consent_at) select '00000000-0000-0000-0000-000000000001', id, 'partner', 'Priya', 'Patel', 'priya.p@hotmail.com', '+44 7700 900568', null, null, null, '{}'::text[], true, '2026-05-09T15:22:35.872Z', true, '2026-05-09T15:22:35.872Z' from new_household returning id)
, ins_contact_2 as (insert into contacts (agency_id, household_id, role, first_name, last_name, email, phone, date_of_birth, passport_expiry, dietary, flags, marketing_opt_in, marketing_opt_in_at, gdpr_consent, gdpr_consent_at) select '00000000-0000-0000-0000-000000000001', id, 'child', 'Arjun', 'Patel', null, null, '2010-09-12', null, null, '{}'::text[], false, null, false, null from new_household returning id)
, ins_contact_3 as (insert into contacts (agency_id, household_id, role, first_name, last_name, email, phone, date_of_birth, passport_expiry, dietary, flags, marketing_opt_in, marketing_opt_in_at, gdpr_consent, gdpr_consent_at) select '00000000-0000-0000-0000-000000000001', id, 'child', 'Anika', 'Patel', null, null, '2013-01-30', null, null, '{}'::text[], false, null, false, null from new_household returning id)
, ins_contact_4 as (insert into contacts (agency_id, household_id, role, first_name, last_name, email, phone, date_of_birth, passport_expiry, dietary, flags, marketing_opt_in, marketing_opt_in_at, gdpr_consent, gdpr_consent_at) select '00000000-0000-0000-0000-000000000001', id, 'child', 'Vikram', 'Patel', null, null, '2016-05-18', null, null, '{}'::text[], false, null, false, null from new_household returning id)
, ins_trip_5 as (insert into trips (agency_id, household_id, reference, stage, destination, destination_country, depart_date, return_date, duration_nights, total_value, currency, occasion, notes, source) select '00000000-0000-0000-0000-000000000001', id, 'TG-2025-077', 'returned'::trip_stage, 'Dubai', 'AE', '2025-11-10', '2025-11-20', 10, 11800, 'GBP', null, null, 'phone' from new_household returning id)
, ins_trip_6 as (insert into trips (agency_id, household_id, reference, stage, destination, destination_country, depart_date, return_date, duration_nights, total_value, currency, occasion, notes, source) select '00000000-0000-0000-0000-000000000001', id, 'TG-2026-022', 'enquiry'::trip_stage, 'Sardinia, Italy', 'IT', null, null, null, 8400, 'GBP', null, null, 'phone' from new_household returning id)
, ins_ix_7 as (insert into interactions (agency_id, household_id, kind, channel, direction, subject, body, body_summary, ai_priority, ai_reason, is_read, is_triaged, occurred_at) select '00000000-0000-0000-0000-000000000001', id, 'email_in'::interaction_kind, 'email', 'inbound', 'Re: Sardinia options for July', 'Thanks for the three options. We discussed it as a family and lean toward the second one, but want to know if you can tweak the dates by a week and add a private chef for one evening.', 'Patels favour option 2 of Sardinia trip, want a date tweak and a private chef added.', 'week', 'Warming up · opened quote 4× · close-able with one tweak', true, true, '2026-05-09T12:22:35.872Z' from new_household returning id)
select 1 from new_household;

-- Household: David & Susan Walsh
with new_household as (
  insert into households (
    agency_id, display_name, household_type, city, postcode, country, tags,
    notes, customer_since, lifetime_value, trips_count, next_departure, last_booking_at,
    ai_brief, ai_brief_at
  ) values (
    '00000000-0000-0000-0000-000000000001',
    'David & Susan Walsh',
    'couple',
    'Christchurch',
    'BH23 1AB',
    'GB',
    '{"Honeymoon"}'::text[],
    null,
    '2020-02-14',
    31250,
    1,
    null,
    '2025-05-04T00:00:00.000Z',
    null,
    null
  ) returning id
)
, ins_contact_0 as (insert into contacts (agency_id, household_id, role, first_name, last_name, email, phone, date_of_birth, passport_expiry, dietary, flags, marketing_opt_in, marketing_opt_in_at, gdpr_consent, gdpr_consent_at) select '00000000-0000-0000-0000-000000000001', id, 'lead', 'David', 'Walsh', 'd.walsh@btinternet.com', '+44 7700 900789', null, null, null, '{}'::text[], true, '2026-05-09T15:22:35.872Z', true, '2026-05-09T15:22:35.872Z' from new_household returning id)
, ins_contact_1 as (insert into contacts (agency_id, household_id, role, first_name, last_name, email, phone, date_of_birth, passport_expiry, dietary, flags, marketing_opt_in, marketing_opt_in_at, gdpr_consent, gdpr_consent_at) select '00000000-0000-0000-0000-000000000001', id, 'partner', 'Susan', 'Walsh', 's.walsh@btinternet.com', '+44 7700 900790', null, null, null, '{}'::text[], true, '2026-05-09T15:22:35.872Z', true, '2026-05-09T15:22:35.872Z' from new_household returning id)
, ins_trip_2 as (insert into trips (agency_id, household_id, reference, stage, destination, destination_country, depart_date, return_date, duration_nights, total_value, currency, occasion, notes, source) select '00000000-0000-0000-0000-000000000001', id, 'TG-2025-040', 'returned'::trip_stage, 'Bali, Indonesia', 'ID', '2025-05-04', '2025-05-19', 14, 7200, 'GBP', 'honeymoon', null, 'phone' from new_household returning id)
select 1 from new_household;

-- Household: Andrew McKenzie
with new_household as (
  insert into households (
    agency_id, display_name, household_type, city, postcode, country, tags,
    notes, customer_since, lifetime_value, trips_count, next_departure, last_booking_at,
    ai_brief, ai_brief_at
  ) values (
    '00000000-0000-0000-0000-000000000001',
    'Andrew McKenzie',
    'solo',
    'Bournemouth',
    'BH8 8AA',
    'GB',
    '{"New"}'::text[],
    null,
    '2024-11-10',
    8900,
    2,
    null,
    '2024-11-15T00:00:00.000Z',
    null,
    null
  ) returning id
)
, ins_contact_0 as (insert into contacts (agency_id, household_id, role, first_name, last_name, email, phone, date_of_birth, passport_expiry, dietary, flags, marketing_opt_in, marketing_opt_in_at, gdpr_consent, gdpr_consent_at) select '00000000-0000-0000-0000-000000000001', id, 'lead', 'Andrew', 'McKenzie', 'andrew.m@gmail.com', '+44 7700 900234', null, null, null, '{}'::text[], true, '2026-05-09T15:22:35.872Z', true, '2026-05-09T15:22:35.872Z' from new_household returning id)
, ins_trip_1 as (insert into trips (agency_id, household_id, reference, stage, destination, destination_country, depart_date, return_date, duration_nights, total_value, currency, occasion, notes, source) select '00000000-0000-0000-0000-000000000001', id, 'TG-2025-130', 'returned'::trip_stage, 'Iceland', 'IS', '2024-11-15', '2024-11-22', 7, 2400, 'GBP', null, null, 'website' from new_household returning id)
, ins_trip_2 as (insert into trips (agency_id, household_id, reference, stage, destination, destination_country, depart_date, return_date, duration_nights, total_value, currency, occasion, notes, source) select '00000000-0000-0000-0000-000000000001', id, 'TG-2026-045', 'quoted'::trip_stage, 'Costa Rica', 'CR', null, null, 12, 4650, 'GBP', null, null, 'website' from new_household returning id)
, ins_ix_3 as (insert into interactions (agency_id, household_id, kind, channel, direction, subject, body, body_summary, ai_priority, ai_reason, is_read, is_triaged, occurred_at) select '00000000-0000-0000-0000-000000000001', id, 'email_in'::interaction_kind, 'email', 'inbound', 'Re: Costa Rica itinerary version 3', 'Looks great. The Manuel Antonio bit looks perfect. One ask — can we add a day in the cloud forest at Monteverde? I read it''s incredible.', null, 'week', 'Engaged buyer · easy itinerary tweak · close this week', true, true, '2026-05-09T07:22:35.872Z' from new_household returning id)
select 1 from new_household;

-- Household: The Nguyen Family
with new_household as (
  insert into households (
    agency_id, display_name, household_type, city, postcode, country, tags,
    notes, customer_since, lifetime_value, trips_count, next_departure, last_booking_at,
    ai_brief, ai_brief_at
  ) values (
    '00000000-0000-0000-0000-000000000001',
    'The Nguyen Family',
    'family',
    'Salisbury',
    'SP1 1AA',
    'GB',
    '{"Repeat"}'::text[],
    null,
    '2021-04-04',
    19840,
    2,
    '2026-08-06',
    '2026-08-06T00:00:00.000Z',
    null,
    null
  ) returning id
)
, ins_contact_0 as (insert into contacts (agency_id, household_id, role, first_name, last_name, email, phone, date_of_birth, passport_expiry, dietary, flags, marketing_opt_in, marketing_opt_in_at, gdpr_consent, gdpr_consent_at) select '00000000-0000-0000-0000-000000000001', id, 'lead', 'Minh', 'Nguyen', 'minh.nguyen@yahoo.co.uk', '+44 7700 900345', null, null, null, '{}'::text[], true, '2026-05-09T15:22:35.872Z', true, '2026-05-09T15:22:35.872Z' from new_household returning id)
, ins_contact_1 as (insert into contacts (agency_id, household_id, role, first_name, last_name, email, phone, date_of_birth, passport_expiry, dietary, flags, marketing_opt_in, marketing_opt_in_at, gdpr_consent, gdpr_consent_at) select '00000000-0000-0000-0000-000000000001', id, 'partner', 'Linh', 'Nguyen', 'linh.n@yahoo.co.uk', '+44 7700 900346', null, null, null, '{}'::text[], true, '2026-05-09T15:22:35.872Z', true, '2026-05-09T15:22:35.872Z' from new_household returning id)
, ins_contact_2 as (insert into contacts (agency_id, household_id, role, first_name, last_name, email, phone, date_of_birth, passport_expiry, dietary, flags, marketing_opt_in, marketing_opt_in_at, gdpr_consent, gdpr_consent_at) select '00000000-0000-0000-0000-000000000001', id, 'child', 'Khanh', 'Nguyen', null, null, '2012-07-15', null, null, '{}'::text[], false, null, false, null from new_household returning id)
, ins_contact_3 as (insert into contacts (agency_id, household_id, role, first_name, last_name, email, phone, date_of_birth, passport_expiry, dietary, flags, marketing_opt_in, marketing_opt_in_at, gdpr_consent, gdpr_consent_at) select '00000000-0000-0000-0000-000000000001', id, 'child', 'An', 'Nguyen', null, null, '2015-11-02', null, null, '{}'::text[], false, null, false, null from new_household returning id)
, ins_trip_4 as (insert into trips (agency_id, household_id, reference, stage, destination, destination_country, depart_date, return_date, duration_nights, total_value, currency, occasion, notes, source) select '00000000-0000-0000-0000-000000000001', id, 'TG-2025-095', 'returned'::trip_stage, 'Mallorca, Spain', 'ES', '2025-07-23', '2025-07-30', 7, 4100, 'GBP', null, null, 'phone' from new_household returning id)
, ins_trip_5 as (insert into trips (agency_id, household_id, reference, stage, destination, destination_country, depart_date, return_date, duration_nights, total_value, currency, occasion, notes, source) select '00000000-0000-0000-0000-000000000001', id, 'TG-2026-058', 'booked'::trip_stage, 'Tenerife, Spain', 'ES', '2026-08-06', '2026-08-13', 7, 3290, 'GBP', null, null, 'phone' from new_household returning id)
select 1 from new_household;

-- Household: Helen Ashworth
with new_household as (
  insert into households (
    agency_id, display_name, household_type, city, postcode, country, tags,
    notes, customer_since, lifetime_value, trips_count, next_departure, last_booking_at,
    ai_brief, ai_brief_at
  ) values (
    '00000000-0000-0000-0000-000000000001',
    'Helen Ashworth',
    'solo',
    'New Forest',
    'SO43 7BD',
    'GB',
    '{"Adventure"}'::text[],
    null,
    '2022-08-30',
    14260,
    2,
    '2026-05-23',
    '2026-05-23T00:00:00.000Z',
    null,
    null
  ) returning id
)
, ins_contact_0 as (insert into contacts (agency_id, household_id, role, first_name, last_name, email, phone, date_of_birth, passport_expiry, dietary, flags, marketing_opt_in, marketing_opt_in_at, gdpr_consent, gdpr_consent_at) select '00000000-0000-0000-0000-000000000001', id, 'lead', 'Helen', 'Ashworth', 'helen.ashworth@gmail.com', '+44 7700 900456', '1974-05-09', null, null, '{}'::text[], true, '2026-05-09T15:22:35.872Z', true, '2026-05-09T15:22:35.872Z' from new_household returning id)
, ins_trip_1 as (insert into trips (agency_id, household_id, reference, stage, destination, destination_country, depart_date, return_date, duration_nights, total_value, currency, occasion, notes, source) select '00000000-0000-0000-0000-000000000001', id, 'TG-2025-115', 'returned'::trip_stage, 'Patagonia, Argentina', 'AR', '2026-01-09', '2026-01-23', 14, 5800, 'GBP', null, null, 'phone' from new_household returning id)
, ins_trip_2 as (insert into trips (agency_id, household_id, reference, stage, destination, destination_country, depart_date, return_date, duration_nights, total_value, currency, occasion, notes, source) select '00000000-0000-0000-0000-000000000001', id, 'TG-2026-061', 'pre_departure'::trip_stage, 'Faroe Islands', 'FO', '2026-05-23', '2026-05-30', 7, 2600, 'GBP', null, null, 'phone' from new_household returning id)
, ins_ix_3 as (insert into interactions (agency_id, household_id, kind, channel, direction, subject, body, body_summary, ai_priority, ai_reason, is_read, is_triaged, occurred_at) select '00000000-0000-0000-0000-000000000001', id, 'email_in'::interaction_kind, 'email', 'inbound', 'Re: Faroe Islands packing list', 'Brilliant, thanks for the list. Already have most things, will need to grab proper waterproof boots. The car hire is sorted then yes?', null, 'week', 'Polite check-in · 14 days to departure · low urgency', true, true, '2026-05-09T10:22:35.872Z' from new_household returning id)
select 1 from new_household;

-- Household: Simon & Rachel Bevan
with new_household as (
  insert into households (
    agency_id, display_name, household_type, city, postcode, country, tags,
    notes, customer_since, lifetime_value, trips_count, next_departure, last_booking_at,
    ai_brief, ai_brief_at
  ) values (
    '00000000-0000-0000-0000-000000000001',
    'Simon & Rachel Bevan',
    'couple',
    'Wimborne',
    'BH21 1AA',
    'GB',
    '{"Anniversary"}'::text[],
    null,
    '2019-10-15',
    22150,
    2,
    null,
    '2025-04-24T00:00:00.000Z',
    null,
    null
  ) returning id
)
, ins_contact_0 as (insert into contacts (agency_id, household_id, role, first_name, last_name, email, phone, date_of_birth, passport_expiry, dietary, flags, marketing_opt_in, marketing_opt_in_at, gdpr_consent, gdpr_consent_at) select '00000000-0000-0000-0000-000000000001', id, 'lead', 'Simon', 'Bevan', 's.bevan@icloud.com', '+44 7700 900678', null, null, null, '{}'::text[], true, '2026-05-09T15:22:35.872Z', true, '2026-05-09T15:22:35.872Z' from new_household returning id)
, ins_contact_1 as (insert into contacts (agency_id, household_id, role, first_name, last_name, email, phone, date_of_birth, passport_expiry, dietary, flags, marketing_opt_in, marketing_opt_in_at, gdpr_consent, gdpr_consent_at) select '00000000-0000-0000-0000-000000000001', id, 'partner', 'Rachel', 'Bevan', 'r.bevan@icloud.com', '+44 7700 900679', null, null, null, '{}'::text[], true, '2026-05-09T15:22:35.872Z', true, '2026-05-09T15:22:35.872Z' from new_household returning id)
, ins_trip_2 as (insert into trips (agency_id, household_id, reference, stage, destination, destination_country, depart_date, return_date, duration_nights, total_value, currency, occasion, notes, source) select '00000000-0000-0000-0000-000000000001', id, 'TG-2024-203', 'returned'::trip_stage, 'Santorini, Greece', 'GR', '2025-04-24', '2025-05-01', 7, 5800, 'GBP', null, null, 'phone' from new_household returning id)
, ins_trip_3 as (insert into trips (agency_id, household_id, reference, stage, destination, destination_country, depart_date, return_date, duration_nights, total_value, currency, occasion, notes, source) select '00000000-0000-0000-0000-000000000001', id, 'TG-2026-070', 'enquiry'::trip_stage, 'Mykonos, Greece', 'GR', null, null, null, 3800, 'GBP', 'anniversary', null, 'phone' from new_household returning id)
select 1 from new_household;

-- Household: Edwards Family
with new_household as (
  insert into households (
    agency_id, display_name, household_type, city, postcode, country, tags,
    notes, customer_since, lifetime_value, trips_count, next_departure, last_booking_at,
    ai_brief, ai_brief_at
  ) values (
    '00000000-0000-0000-0000-000000000001',
    'Edwards Family',
    'family',
    'Bournemouth',
    'BH4 9AA',
    'GB',
    '{"Multi-gen"}'::text[],
    null,
    '2018-03-18',
    38900,
    2,
    '2026-06-23',
    '2026-06-23T00:00:00.000Z',
    null,
    null
  ) returning id
)
, ins_contact_0 as (insert into contacts (agency_id, household_id, role, first_name, last_name, email, phone, date_of_birth, passport_expiry, dietary, flags, marketing_opt_in, marketing_opt_in_at, gdpr_consent, gdpr_consent_at) select '00000000-0000-0000-0000-000000000001', id, 'lead', 'Lucy', 'Edwards', 'lucy.edwards@hotmail.co.uk', '+44 7700 900890', null, null, null, '{}'::text[], true, '2026-05-09T15:22:35.872Z', true, '2026-05-09T15:22:35.872Z' from new_household returning id)
, ins_contact_1 as (insert into contacts (agency_id, household_id, role, first_name, last_name, email, phone, date_of_birth, passport_expiry, dietary, flags, marketing_opt_in, marketing_opt_in_at, gdpr_consent, gdpr_consent_at) select '00000000-0000-0000-0000-000000000001', id, 'partner', 'Mark', 'Edwards', 'm.edwards@hotmail.co.uk', '+44 7700 900891', null, null, null, '{}'::text[], true, '2026-05-09T15:22:35.872Z', true, '2026-05-09T15:22:35.872Z' from new_household returning id)
, ins_contact_2 as (insert into contacts (agency_id, household_id, role, first_name, last_name, email, phone, date_of_birth, passport_expiry, dietary, flags, marketing_opt_in, marketing_opt_in_at, gdpr_consent, gdpr_consent_at) select '00000000-0000-0000-0000-000000000001', id, 'child', 'Sophie', 'Edwards', null, null, '2009-04-21', null, null, '{}'::text[], false, null, false, null from new_household returning id)
, ins_contact_3 as (insert into contacts (agency_id, household_id, role, first_name, last_name, email, phone, date_of_birth, passport_expiry, dietary, flags, marketing_opt_in, marketing_opt_in_at, gdpr_consent, gdpr_consent_at) select '00000000-0000-0000-0000-000000000001', id, 'child', 'Jacob', 'Edwards', null, null, '2011-08-13', null, null, '{}'::text[], false, null, false, null from new_household returning id)
, ins_contact_4 as (insert into contacts (agency_id, household_id, role, first_name, last_name, email, phone, date_of_birth, passport_expiry, dietary, flags, marketing_opt_in, marketing_opt_in_at, gdpr_consent, gdpr_consent_at) select '00000000-0000-0000-0000-000000000001', id, 'dependant', 'Brenda', 'Edwards', null, null, '1948-12-04', null, null, '{}'::text[], false, null, false, null from new_household returning id)
, ins_contact_5 as (insert into contacts (agency_id, household_id, role, first_name, last_name, email, phone, date_of_birth, passport_expiry, dietary, flags, marketing_opt_in, marketing_opt_in_at, gdpr_consent, gdpr_consent_at) select '00000000-0000-0000-0000-000000000001', id, 'dependant', 'Geoffrey', 'Edwards', null, null, '1946-06-22', null, null, '{}'::text[], false, null, false, null from new_household returning id)
, ins_trip_6 as (insert into trips (agency_id, household_id, reference, stage, destination, destination_country, depart_date, return_date, duration_nights, total_value, currency, occasion, notes, source) select '00000000-0000-0000-0000-000000000001', id, 'TG-2025-085', 'returned'::trip_stage, 'Lanzarote', 'ES', '2025-10-21', '2025-10-28', 7, 4900, 'GBP', null, null, 'phone' from new_household returning id)
, ins_trip_7 as (insert into trips (agency_id, household_id, reference, stage, destination, destination_country, depart_date, return_date, duration_nights, total_value, currency, occasion, notes, source) select '00000000-0000-0000-0000-000000000001', id, 'TG-2026-080', 'booked'::trip_stage, 'Algarve, Portugal', 'PT', '2026-06-23', '2026-07-03', 10, 6800, 'GBP', null, null, 'phone' from new_household returning id)
select 1 from new_household;

-- Household: Robert Hargreaves
with new_household as (
  insert into households (
    agency_id, display_name, household_type, city, postcode, country, tags,
    notes, customer_since, lifetime_value, trips_count, next_departure, last_booking_at,
    ai_brief, ai_brief_at
  ) values (
    '00000000-0000-0000-0000-000000000001',
    'Robert Hargreaves',
    'solo',
    'Bournemouth',
    'BH2 5AA',
    'GB',
    '{"VIP"}'::text[],
    null,
    '2015-07-09',
    47200,
    2,
    null,
    '2026-05-07T00:00:00.000Z',
    null,
    null
  ) returning id
)
, ins_contact_0 as (insert into contacts (agency_id, household_id, role, first_name, last_name, email, phone, date_of_birth, passport_expiry, dietary, flags, marketing_opt_in, marketing_opt_in_at, gdpr_consent, gdpr_consent_at) select '00000000-0000-0000-0000-000000000001', id, 'lead', 'Robert', 'Hargreaves', 'r.hargreaves@gmail.com', '+44 7700 900901', null, null, null, '{}'::text[], true, '2026-05-09T15:22:35.872Z', true, '2026-05-09T15:22:35.872Z' from new_household returning id)
, ins_trip_1 as (insert into trips (agency_id, household_id, reference, stage, destination, destination_country, depart_date, return_date, duration_nights, total_value, currency, occasion, notes, source) select '00000000-0000-0000-0000-000000000001', id, 'TG-2026-005', 'travelling'::trip_stage, 'Maldives', 'MV', '2026-05-07', '2026-05-17', 10, 15200, 'GBP', null, null, 'phone' from new_household returning id)
, ins_trip_2 as (insert into trips (agency_id, household_id, reference, stage, destination, destination_country, depart_date, return_date, duration_nights, total_value, currency, occasion, notes, source) select '00000000-0000-0000-0000-000000000001', id, 'TG-2025-005', 'returned'::trip_stage, 'Galápagos', 'EC', '2025-11-10', '2025-11-23', 13, 18000, 'GBP', null, null, 'phone' from new_household returning id)
select 1 from new_household;

-- Household: Olivia Carr
with new_household as (
  insert into households (
    agency_id, display_name, household_type, city, postcode, country, tags,
    notes, customer_since, lifetime_value, trips_count, next_departure, last_booking_at,
    ai_brief, ai_brief_at
  ) values (
    '00000000-0000-0000-0000-000000000001',
    'Olivia Carr',
    'solo',
    'Lymington',
    'SO41 9AA',
    'GB',
    '{"New"}'::text[],
    null,
    '2026-05-09',
    0,
    1,
    null,
    null,
    null,
    null
  ) returning id
)
, ins_contact_0 as (insert into contacts (agency_id, household_id, role, first_name, last_name, email, phone, date_of_birth, passport_expiry, dietary, flags, marketing_opt_in, marketing_opt_in_at, gdpr_consent, gdpr_consent_at) select '00000000-0000-0000-0000-000000000001', id, 'lead', 'Olivia', 'Carr', 'olivia.c.carr@yahoo.com', '+44 7700 901012', null, null, null, '{}'::text[], true, '2026-05-09T15:22:35.872Z', true, '2026-05-09T15:22:35.872Z' from new_household returning id)
, ins_trip_1 as (insert into trips (agency_id, household_id, reference, stage, destination, destination_country, depart_date, return_date, duration_nights, total_value, currency, occasion, notes, source) select '00000000-0000-0000-0000-000000000001', id, 'TG-2026-100', 'enquiry'::trip_stage, 'Tulum, Mexico', 'MX', null, null, 14, 3200, 'GBP', 'honeymoon', null, 'widget_enquiry' from new_household returning id)
, ins_ix_2 as (insert into interactions (agency_id, household_id, kind, channel, direction, subject, body, body_summary, ai_priority, ai_reason, is_read, is_triaged, occurred_at) select '00000000-0000-0000-0000-000000000001', id, 'enquiry'::interaction_kind, 'web_form', 'inbound', 'Tulum honeymoon — first enquiry', 'Submitted via website enquiry form. Looking for 14-night honeymoon in Tulum, October-ish, mid-range budget around £3-4k for two. Would love beachfront with a good vibe, not too party-heavy.', null, 'today', 'New lead · 38 min old · honeymoons close fast', false, true, '2026-05-09T14:46:35.872Z' from new_household returning id)
select 1 from new_household;

-- Household: Williams-Hughes
with new_household as (
  insert into households (
    agency_id, display_name, household_type, city, postcode, country, tags,
    notes, customer_since, lifetime_value, trips_count, next_departure, last_booking_at,
    ai_brief, ai_brief_at
  ) values (
    '00000000-0000-0000-0000-000000000001',
    'Williams-Hughes',
    'family',
    'Ringwood',
    'BH24 1AA',
    'GB',
    '{"Repeat"}'::text[],
    null,
    '2020-05-05',
    27400,
    2,
    '2026-05-19',
    '2026-05-19T00:00:00.000Z',
    null,
    null
  ) returning id
)
, ins_contact_0 as (insert into contacts (agency_id, household_id, role, first_name, last_name, email, phone, date_of_birth, passport_expiry, dietary, flags, marketing_opt_in, marketing_opt_in_at, gdpr_consent, gdpr_consent_at) select '00000000-0000-0000-0000-000000000001', id, 'lead', 'Gareth', 'Williams-Hughes', 'g.williams@hotmail.com', '+44 7700 901123', null, null, null, '{}'::text[], true, '2026-05-09T15:22:35.872Z', true, '2026-05-09T15:22:35.872Z' from new_household returning id)
, ins_contact_1 as (insert into contacts (agency_id, household_id, role, first_name, last_name, email, phone, date_of_birth, passport_expiry, dietary, flags, marketing_opt_in, marketing_opt_in_at, gdpr_consent, gdpr_consent_at) select '00000000-0000-0000-0000-000000000001', id, 'partner', 'Eleri', 'Williams-Hughes', 'e.williams@hotmail.com', '+44 7700 901124', null, null, null, '{}'::text[], true, '2026-05-09T15:22:35.872Z', true, '2026-05-09T15:22:35.872Z' from new_household returning id)
, ins_contact_2 as (insert into contacts (agency_id, household_id, role, first_name, last_name, email, phone, date_of_birth, passport_expiry, dietary, flags, marketing_opt_in, marketing_opt_in_at, gdpr_consent, gdpr_consent_at) select '00000000-0000-0000-0000-000000000001', id, 'child', 'Megan', 'Williams-Hughes', null, null, '2013-02-14', null, null, '{}'::text[], false, null, false, null from new_household returning id)
, ins_contact_3 as (insert into contacts (agency_id, household_id, role, first_name, last_name, email, phone, date_of_birth, passport_expiry, dietary, flags, marketing_opt_in, marketing_opt_in_at, gdpr_consent, gdpr_consent_at) select '00000000-0000-0000-0000-000000000001', id, 'child', 'Owen', 'Williams-Hughes', null, null, '2016-10-08', null, null, '{}'::text[], false, null, false, null from new_household returning id)
, ins_trip_4 as (insert into trips (agency_id, household_id, reference, stage, destination, destination_country, depart_date, return_date, duration_nights, total_value, currency, occasion, notes, source) select '00000000-0000-0000-0000-000000000001', id, 'TG-2025-152', 'returned'::trip_stage, 'Cornwall', 'GB', '2025-09-01', '2025-09-08', 7, 1800, 'GBP', null, null, 'phone' from new_household returning id)
, ins_trip_5 as (insert into trips (agency_id, household_id, reference, stage, destination, destination_country, depart_date, return_date, duration_nights, total_value, currency, occasion, notes, source) select '00000000-0000-0000-0000-000000000001', id, 'TG-2026-110', 'pre_departure'::trip_stage, 'Crete, Greece', 'GR', '2026-05-19', '2026-05-26', 7, 4650, 'GBP', null, null, 'phone' from new_household returning id)
select 1 from new_household;

-- Household: Tom & Lisa Bryant
with new_household as (
  insert into households (
    agency_id, display_name, household_type, city, postcode, country, tags,
    notes, customer_since, lifetime_value, trips_count, next_departure, last_booking_at,
    ai_brief, ai_brief_at
  ) values (
    '00000000-0000-0000-0000-000000000001',
    'Tom & Lisa Bryant',
    'couple',
    'Verwood',
    'BH31 1AA',
    'GB',
    '{"Babymoon"}'::text[],
    null,
    '2023-01-20',
    16800,
    1,
    null,
    '2025-02-13T00:00:00.000Z',
    null,
    null
  ) returning id
)
, ins_contact_0 as (insert into contacts (agency_id, household_id, role, first_name, last_name, email, phone, date_of_birth, passport_expiry, dietary, flags, marketing_opt_in, marketing_opt_in_at, gdpr_consent, gdpr_consent_at) select '00000000-0000-0000-0000-000000000001', id, 'lead', 'Tom', 'Bryant', 'tom.bryant@gmail.com', '+44 7700 901234', null, null, null, '{}'::text[], true, '2026-05-09T15:22:35.872Z', true, '2026-05-09T15:22:35.872Z' from new_household returning id)
, ins_contact_1 as (insert into contacts (agency_id, household_id, role, first_name, last_name, email, phone, date_of_birth, passport_expiry, dietary, flags, marketing_opt_in, marketing_opt_in_at, gdpr_consent, gdpr_consent_at) select '00000000-0000-0000-0000-000000000001', id, 'partner', 'Lisa', 'Bryant', 'l.bryant@gmail.com', '+44 7700 901235', null, null, null, '{}'::text[], true, '2026-05-09T15:22:35.872Z', true, '2026-05-09T15:22:35.872Z' from new_household returning id)
, ins_trip_2 as (insert into trips (agency_id, household_id, reference, stage, destination, destination_country, depart_date, return_date, duration_nights, total_value, currency, occasion, notes, source) select '00000000-0000-0000-0000-000000000001', id, 'TG-2024-145', 'returned'::trip_stage, 'Mauritius', 'MU', '2025-02-13', '2025-02-23', 10, 6400, 'GBP', 'babymoon', null, 'phone' from new_household returning id)
select 1 from new_household;

-- Household: Akinwale Family
with new_household as (
  insert into households (
    agency_id, display_name, household_type, city, postcode, country, tags,
    notes, customer_since, lifetime_value, trips_count, next_departure, last_booking_at,
    ai_brief, ai_brief_at
  ) values (
    '00000000-0000-0000-0000-000000000001',
    'Akinwale Family',
    'family',
    'Bournemouth',
    'BH9 2AA',
    'GB',
    '{"Cultural"}'::text[],
    null,
    '2023-06-03',
    11200,
    2,
    null,
    '2025-10-21T00:00:00.000Z',
    null,
    null
  ) returning id
)
, ins_contact_0 as (insert into contacts (agency_id, household_id, role, first_name, last_name, email, phone, date_of_birth, passport_expiry, dietary, flags, marketing_opt_in, marketing_opt_in_at, gdpr_consent, gdpr_consent_at) select '00000000-0000-0000-0000-000000000001', id, 'lead', 'Tunde', 'Akinwale', 'tunde.akinwale@gmail.com', '+44 7700 901345', null, null, null, '{}'::text[], true, '2026-05-09T15:22:35.872Z', true, '2026-05-09T15:22:35.872Z' from new_household returning id)
, ins_contact_1 as (insert into contacts (agency_id, household_id, role, first_name, last_name, email, phone, date_of_birth, passport_expiry, dietary, flags, marketing_opt_in, marketing_opt_in_at, gdpr_consent, gdpr_consent_at) select '00000000-0000-0000-0000-000000000001', id, 'partner', 'Funke', 'Akinwale', 'funke.a@gmail.com', '+44 7700 901346', null, null, null, '{}'::text[], true, '2026-05-09T15:22:35.872Z', true, '2026-05-09T15:22:35.872Z' from new_household returning id)
, ins_contact_2 as (insert into contacts (agency_id, household_id, role, first_name, last_name, email, phone, date_of_birth, passport_expiry, dietary, flags, marketing_opt_in, marketing_opt_in_at, gdpr_consent, gdpr_consent_at) select '00000000-0000-0000-0000-000000000001', id, 'child', 'Ade', 'Akinwale', null, null, '2014-09-25', null, null, '{}'::text[], false, null, false, null from new_household returning id)
, ins_trip_3 as (insert into trips (agency_id, household_id, reference, stage, destination, destination_country, depart_date, return_date, duration_nights, total_value, currency, occasion, notes, source) select '00000000-0000-0000-0000-000000000001', id, 'TG-2025-160', 'returned'::trip_stage, 'Lagos, Nigeria', 'NG', '2025-10-21', '2025-11-04', 14, 5400, 'GBP', null, null, 'phone' from new_household returning id)
, ins_trip_4 as (insert into trips (agency_id, household_id, reference, stage, destination, destination_country, depart_date, return_date, duration_nights, total_value, currency, occasion, notes, source) select '00000000-0000-0000-0000-000000000001', id, 'TG-2026-115', 'quoted'::trip_stage, 'Ghana', 'GH', null, null, 14, 5400, 'GBP', null, null, 'phone' from new_household returning id)
select 1 from new_household;

-- Household: Eleanor Cartwright
with new_household as (
  insert into households (
    agency_id, display_name, household_type, city, postcode, country, tags,
    notes, customer_since, lifetime_value, trips_count, next_departure, last_booking_at,
    ai_brief, ai_brief_at
  ) values (
    '00000000-0000-0000-0000-000000000001',
    'Eleanor Cartwright',
    'solo',
    'Wareham',
    'BH20 4AA',
    'GB',
    '{"Senior"}'::text[],
    null,
    '2017-11-15',
    21300,
    2,
    '2026-07-08',
    '2026-07-08T00:00:00.000Z',
    null,
    null
  ) returning id
)
, ins_contact_0 as (insert into contacts (agency_id, household_id, role, first_name, last_name, email, phone, date_of_birth, passport_expiry, dietary, flags, marketing_opt_in, marketing_opt_in_at, gdpr_consent, gdpr_consent_at) select '00000000-0000-0000-0000-000000000001', id, 'lead', 'Eleanor', 'Cartwright', 'e.cartwright@btinternet.com', '+44 7700 901456', '1948-04-30', null, null, '{}'::text[], true, '2026-05-09T15:22:35.872Z', true, '2026-05-09T15:22:35.872Z' from new_household returning id)
, ins_trip_1 as (insert into trips (agency_id, household_id, reference, stage, destination, destination_country, depart_date, return_date, duration_nights, total_value, currency, occasion, notes, source) select '00000000-0000-0000-0000-000000000001', id, 'TG-2025-180', 'returned'::trip_stage, 'Danube River Cruise', 'AT', '2026-01-29', '2026-02-12', 14, 4200, 'GBP', null, null, 'phone' from new_household returning id)
, ins_trip_2 as (insert into trips (agency_id, household_id, reference, stage, destination, destination_country, depart_date, return_date, duration_nights, total_value, currency, occasion, notes, source) select '00000000-0000-0000-0000-000000000001', id, 'TG-2026-120', 'booked'::trip_stage, 'Norwegian Fjords Cruise', 'NO', '2026-07-08', '2026-07-15', 7, 3900, 'GBP', null, null, 'phone' from new_household returning id)
select 1 from new_household;

-- Household: Park Family
with new_household as (
  insert into households (
    agency_id, display_name, household_type, city, postcode, country, tags,
    notes, customer_since, lifetime_value, trips_count, next_departure, last_booking_at,
    ai_brief, ai_brief_at
  ) values (
    '00000000-0000-0000-0000-000000000001',
    'Park Family',
    'family',
    'Bournemouth',
    'BH7 6AA',
    'GB',
    '{"Repeat"}'::text[],
    null,
    '2021-09-10',
    18650,
    2,
    '2026-05-14',
    '2026-05-14T00:00:00.000Z',
    null,
    null
  ) returning id
)
, ins_contact_0 as (insert into contacts (agency_id, household_id, role, first_name, last_name, email, phone, date_of_birth, passport_expiry, dietary, flags, marketing_opt_in, marketing_opt_in_at, gdpr_consent, gdpr_consent_at) select '00000000-0000-0000-0000-000000000001', id, 'lead', 'Jin', 'Park', 'jin.park@gmail.com', '+44 7700 901567', null, null, null, '{}'::text[], true, '2026-05-09T15:22:35.872Z', true, '2026-05-09T15:22:35.872Z' from new_household returning id)
, ins_contact_1 as (insert into contacts (agency_id, household_id, role, first_name, last_name, email, phone, date_of_birth, passport_expiry, dietary, flags, marketing_opt_in, marketing_opt_in_at, gdpr_consent, gdpr_consent_at) select '00000000-0000-0000-0000-000000000001', id, 'partner', 'Soo', 'Park', 'soo.park@gmail.com', '+44 7700 901568', null, null, null, '{}'::text[], true, '2026-05-09T15:22:35.872Z', true, '2026-05-09T15:22:35.872Z' from new_household returning id)
, ins_contact_2 as (insert into contacts (agency_id, household_id, role, first_name, last_name, email, phone, date_of_birth, passport_expiry, dietary, flags, marketing_opt_in, marketing_opt_in_at, gdpr_consent, gdpr_consent_at) select '00000000-0000-0000-0000-000000000001', id, 'child', 'Jun', 'Park', null, null, '2014-12-15', null, null, '{}'::text[], false, null, false, null from new_household returning id)
, ins_contact_3 as (insert into contacts (agency_id, household_id, role, first_name, last_name, email, phone, date_of_birth, passport_expiry, dietary, flags, marketing_opt_in, marketing_opt_in_at, gdpr_consent, gdpr_consent_at) select '00000000-0000-0000-0000-000000000001', id, 'child', 'Mina', 'Park', null, null, '2017-03-08', null, null, '{}'::text[], false, null, false, null from new_household returning id)
, ins_trip_4 as (insert into trips (agency_id, household_id, reference, stage, destination, destination_country, depart_date, return_date, duration_nights, total_value, currency, occasion, notes, source) select '00000000-0000-0000-0000-000000000001', id, 'TG-2025-195', 'returned'::trip_stage, 'Disneyland Paris', 'FR', '2025-12-10', '2025-12-15', 5, 2400, 'GBP', null, null, 'phone' from new_household returning id)
, ins_trip_5 as (insert into trips (agency_id, household_id, reference, stage, destination, destination_country, depart_date, return_date, duration_nights, total_value, currency, occasion, notes, source) select '00000000-0000-0000-0000-000000000001', id, 'TG-2026-130', 'pre_departure'::trip_stage, 'Lake Garda, Italy', 'IT', '2026-05-14', '2026-05-21', 7, 3400, 'GBP', null, null, 'phone' from new_household returning id)
select 1 from new_household;

-- Household: Margaret & Brian Doyle
with new_household as (
  insert into households (
    agency_id, display_name, household_type, city, postcode, country, tags,
    notes, customer_since, lifetime_value, trips_count, next_departure, last_booking_at,
    ai_brief, ai_brief_at
  ) values (
    '00000000-0000-0000-0000-000000000001',
    'Margaret & Brian Doyle',
    'couple',
    'Bournemouth',
    'BH5 1AA',
    'GB',
    '{"Repeat"}'::text[],
    null,
    '2014-05-20',
    35200,
    1,
    null,
    '2024-05-19T00:00:00.000Z',
    null,
    null
  ) returning id
)
, ins_contact_0 as (insert into contacts (agency_id, household_id, role, first_name, last_name, email, phone, date_of_birth, passport_expiry, dietary, flags, marketing_opt_in, marketing_opt_in_at, gdpr_consent, gdpr_consent_at) select '00000000-0000-0000-0000-000000000001', id, 'lead', 'Margaret', 'Doyle', 'margaret.doyle@aol.com', '+44 7700 901678', '1960-08-15', '2026-08-30', null, '{}'::text[], true, '2026-05-09T15:22:35.872Z', true, '2026-05-09T15:22:35.872Z' from new_household returning id)
, ins_contact_1 as (insert into contacts (agency_id, household_id, role, first_name, last_name, email, phone, date_of_birth, passport_expiry, dietary, flags, marketing_opt_in, marketing_opt_in_at, gdpr_consent, gdpr_consent_at) select '00000000-0000-0000-0000-000000000001', id, 'partner', 'Brian', 'Doyle', 'brian.d@aol.com', '+44 7700 901679', '1958-03-22', '2026-08-30', null, '{}'::text[], true, '2026-05-09T15:22:35.872Z', true, '2026-05-09T15:22:35.872Z' from new_household returning id)
, ins_trip_2 as (insert into trips (agency_id, household_id, reference, stage, destination, destination_country, depart_date, return_date, duration_nights, total_value, currency, occasion, notes, source) select '00000000-0000-0000-0000-000000000001', id, 'TG-2024-090', 'returned'::trip_stage, 'Sicily, Italy', 'IT', '2024-05-19', '2024-05-26', 7, 4500, 'GBP', null, null, 'phone' from new_household returning id)
, ins_ix_3 as (insert into interactions (agency_id, household_id, kind, channel, direction, subject, body, body_summary, ai_priority, ai_reason, is_read, is_triaged, occurred_at) select '00000000-0000-0000-0000-000000000001', id, 'email_in'::interaction_kind, 'email', 'inbound', 'Long time no speak — thinking about somewhere new', 'Hi Andy, hope all''s well! Brian and I have been talking about getting away properly this autumn. Last big trip was Sicily in 2024 — we''d love something a bit more adventurous this time. Any thoughts?', null, 'later', 'Re-engaged after 2 years · £35k LTV · warm but not urgent', true, true, '2026-05-08T12:22:35.872Z' from new_household returning id)
select 1 from new_household;

-- Household: Stevenson Family
with new_household as (
  insert into households (
    agency_id, display_name, household_type, city, postcode, country, tags,
    notes, customer_since, lifetime_value, trips_count, next_departure, last_booking_at,
    ai_brief, ai_brief_at
  ) values (
    '00000000-0000-0000-0000-000000000001',
    'Stevenson Family',
    'family',
    'Christchurch',
    'BH23 4AA',
    'GB',
    '{"School holiday"}'::text[],
    null,
    '2019-04-15',
    29800,
    2,
    '2026-07-24',
    '2026-07-24T00:00:00.000Z',
    null,
    null
  ) returning id
)
, ins_contact_0 as (insert into contacts (agency_id, household_id, role, first_name, last_name, email, phone, date_of_birth, passport_expiry, dietary, flags, marketing_opt_in, marketing_opt_in_at, gdpr_consent, gdpr_consent_at) select '00000000-0000-0000-0000-000000000001', id, 'lead', 'Kate', 'Stevenson', 'kate.stevenson@hotmail.com', '+44 7700 901789', null, null, null, '{}'::text[], true, '2026-05-09T15:22:35.872Z', true, '2026-05-09T15:22:35.872Z' from new_household returning id)
, ins_contact_1 as (insert into contacts (agency_id, household_id, role, first_name, last_name, email, phone, date_of_birth, passport_expiry, dietary, flags, marketing_opt_in, marketing_opt_in_at, gdpr_consent, gdpr_consent_at) select '00000000-0000-0000-0000-000000000001', id, 'partner', 'Mike', 'Stevenson', 'mike.s@hotmail.com', '+44 7700 901790', null, null, null, '{}'::text[], true, '2026-05-09T15:22:35.872Z', true, '2026-05-09T15:22:35.872Z' from new_household returning id)
, ins_contact_2 as (insert into contacts (agency_id, household_id, role, first_name, last_name, email, phone, date_of_birth, passport_expiry, dietary, flags, marketing_opt_in, marketing_opt_in_at, gdpr_consent, gdpr_consent_at) select '00000000-0000-0000-0000-000000000001', id, 'child', 'Charlie', 'Stevenson', null, null, '2011-07-04', null, null, '{}'::text[], false, null, false, null from new_household returning id)
, ins_contact_3 as (insert into contacts (agency_id, household_id, role, first_name, last_name, email, phone, date_of_birth, passport_expiry, dietary, flags, marketing_opt_in, marketing_opt_in_at, gdpr_consent, gdpr_consent_at) select '00000000-0000-0000-0000-000000000001', id, 'child', 'Lily', 'Stevenson', null, null, '2013-12-22', null, null, '{}'::text[], false, null, false, null from new_household returning id)
, ins_contact_4 as (insert into contacts (agency_id, household_id, role, first_name, last_name, email, phone, date_of_birth, passport_expiry, dietary, flags, marketing_opt_in, marketing_opt_in_at, gdpr_consent, gdpr_consent_at) select '00000000-0000-0000-0000-000000000001', id, 'child', 'Ben', 'Stevenson', null, null, '2016-02-19', null, null, '{}'::text[], false, null, false, null from new_household returning id)
, ins_trip_5 as (insert into trips (agency_id, household_id, reference, stage, destination, destination_country, depart_date, return_date, duration_nights, total_value, currency, occasion, notes, source) select '00000000-0000-0000-0000-000000000001', id, 'TG-2025-040', 'returned'::trip_stage, 'Florida, USA', 'US', '2025-10-21', '2025-11-04', 14, 12400, 'GBP', null, null, 'phone' from new_household returning id)
, ins_trip_6 as (insert into trips (agency_id, household_id, reference, stage, destination, destination_country, depart_date, return_date, duration_nights, total_value, currency, occasion, notes, source) select '00000000-0000-0000-0000-000000000001', id, 'TG-2026-140', 'booked'::trip_stage, 'Antalya, Turkey', 'TR', '2026-07-24', '2026-08-03', 10, 4200, 'GBP', null, null, 'phone' from new_household returning id)
select 1 from new_household;

-- Household: Yusuf Family
with new_household as (
  insert into households (
    agency_id, display_name, household_type, city, postcode, country, tags,
    notes, customer_since, lifetime_value, trips_count, next_departure, last_booking_at,
    ai_brief, ai_brief_at
  ) values (
    '00000000-0000-0000-0000-000000000001',
    'Yusuf Family',
    'family',
    'Southampton',
    'SO15 1AA',
    'GB',
    '{"Cultural"}'::text[],
    null,
    '2022-10-12',
    16900,
    1,
    null,
    '2025-07-13T00:00:00.000Z',
    null,
    null
  ) returning id
)
, ins_contact_0 as (insert into contacts (agency_id, household_id, role, first_name, last_name, email, phone, date_of_birth, passport_expiry, dietary, flags, marketing_opt_in, marketing_opt_in_at, gdpr_consent, gdpr_consent_at) select '00000000-0000-0000-0000-000000000001', id, 'lead', 'Aisha', 'Yusuf', 'aisha.yusuf@gmail.com', '+44 7700 901890', null, null, null, '{}'::text[], true, '2026-05-09T15:22:35.872Z', true, '2026-05-09T15:22:35.872Z' from new_household returning id)
, ins_contact_1 as (insert into contacts (agency_id, household_id, role, first_name, last_name, email, phone, date_of_birth, passport_expiry, dietary, flags, marketing_opt_in, marketing_opt_in_at, gdpr_consent, gdpr_consent_at) select '00000000-0000-0000-0000-000000000001', id, 'partner', 'Hassan', 'Yusuf', 'h.yusuf@gmail.com', '+44 7700 901891', null, null, null, '{}'::text[], true, '2026-05-09T15:22:35.872Z', true, '2026-05-09T15:22:35.872Z' from new_household returning id)
, ins_contact_2 as (insert into contacts (agency_id, household_id, role, first_name, last_name, email, phone, date_of_birth, passport_expiry, dietary, flags, marketing_opt_in, marketing_opt_in_at, gdpr_consent, gdpr_consent_at) select '00000000-0000-0000-0000-000000000001', id, 'child', 'Layla', 'Yusuf', null, null, '2014-06-10', null, null, '{}'::text[], false, null, false, null from new_household returning id)
, ins_contact_3 as (insert into contacts (agency_id, household_id, role, first_name, last_name, email, phone, date_of_birth, passport_expiry, dietary, flags, marketing_opt_in, marketing_opt_in_at, gdpr_consent, gdpr_consent_at) select '00000000-0000-0000-0000-000000000001', id, 'child', 'Omar', 'Yusuf', null, null, '2017-09-28', null, null, '{}'::text[], false, null, false, null from new_household returning id)
, ins_trip_4 as (insert into trips (agency_id, household_id, reference, stage, destination, destination_country, depart_date, return_date, duration_nights, total_value, currency, occasion, notes, source) select '00000000-0000-0000-0000-000000000001', id, 'TG-2025-300', 'returned'::trip_stage, 'Marrakech, Morocco', 'MA', '2025-07-13', '2025-07-20', 7, 3900, 'GBP', null, null, 'phone' from new_household returning id)
select 1 from new_household;

-- Household: Penelope Wright
with new_household as (
  insert into households (
    agency_id, display_name, household_type, city, postcode, country, tags,
    notes, customer_since, lifetime_value, trips_count, next_departure, last_booking_at,
    ai_brief, ai_brief_at
  ) values (
    '00000000-0000-0000-0000-000000000001',
    'Penelope Wright',
    'solo',
    'Wimborne',
    'BH21 7AA',
    'GB',
    '{"New"}'::text[],
    null,
    '2026-05-08',
    0,
    1,
    null,
    null,
    null,
    null
  ) returning id
)
, ins_contact_0 as (insert into contacts (agency_id, household_id, role, first_name, last_name, email, phone, date_of_birth, passport_expiry, dietary, flags, marketing_opt_in, marketing_opt_in_at, gdpr_consent, gdpr_consent_at) select '00000000-0000-0000-0000-000000000001', id, 'lead', 'Penelope', 'Wright', 'penny.wright@btinternet.com', '+44 7700 901901', '1968-04-12', null, null, '{}'::text[], true, '2026-05-09T15:22:35.872Z', true, '2026-05-09T15:22:35.872Z' from new_household returning id)
, ins_trip_1 as (insert into trips (agency_id, household_id, reference, stage, destination, destination_country, depart_date, return_date, duration_nights, total_value, currency, occasion, notes, source) select '00000000-0000-0000-0000-000000000001', id, 'TG-2026-150', 'enquiry'::trip_stage, 'Lake Garda, Italy', 'IT', null, null, null, 2200, 'GBP', null, null, 'widget_enquiry' from new_household returning id)
, ins_ix_2 as (insert into interactions (agency_id, household_id, kind, channel, direction, subject, body, body_summary, ai_priority, ai_reason, is_read, is_triaged, occurred_at) select '00000000-0000-0000-0000-000000000001', id, 'enquiry'::interaction_kind, 'web_form', 'inbound', 'Italian lakes for late September', 'Hi there, looking for a relaxed trip to Italy. Lake Como or Lake Garda. I''m travelling solo but looking for somewhere safe and lovely.', null, 'later', 'New lead · solo · low urgency · September departure', true, true, '2026-05-09T01:22:35.872Z' from new_household returning id)
select 1 from new_household;

-- Household: The Davies
with new_household as (
  insert into households (
    agency_id, display_name, household_type, city, postcode, country, tags,
    notes, customer_since, lifetime_value, trips_count, next_departure, last_booking_at,
    ai_brief, ai_brief_at
  ) values (
    '00000000-0000-0000-0000-000000000001',
    'The Davies',
    'couple',
    'Salisbury',
    'SP2 8AA',
    'GB',
    '{"Repeat"}'::text[],
    null,
    '2020-09-30',
    23700,
    2,
    null,
    '2026-05-08T00:00:00.000Z',
    null,
    null
  ) returning id
)
, ins_contact_0 as (insert into contacts (agency_id, household_id, role, first_name, last_name, email, phone, date_of_birth, passport_expiry, dietary, flags, marketing_opt_in, marketing_opt_in_at, gdpr_consent, gdpr_consent_at) select '00000000-0000-0000-0000-000000000001', id, 'lead', 'Huw', 'Davies', 'huw.davies@yahoo.co.uk', '+44 7700 902012', null, null, null, '{}'::text[], true, '2026-05-09T15:22:35.872Z', true, '2026-05-09T15:22:35.872Z' from new_household returning id)
, ins_contact_1 as (insert into contacts (agency_id, household_id, role, first_name, last_name, email, phone, date_of_birth, passport_expiry, dietary, flags, marketing_opt_in, marketing_opt_in_at, gdpr_consent, gdpr_consent_at) select '00000000-0000-0000-0000-000000000001', id, 'partner', 'Bethan', 'Davies', 'b.davies@yahoo.co.uk', '+44 7700 902013', null, null, null, '{}'::text[], true, '2026-05-09T15:22:35.872Z', true, '2026-05-09T15:22:35.872Z' from new_household returning id)
, ins_trip_2 as (insert into trips (agency_id, household_id, reference, stage, destination, destination_country, depart_date, return_date, duration_nights, total_value, currency, occasion, notes, source) select '00000000-0000-0000-0000-000000000001', id, 'TG-2025-220', 'returned'::trip_stage, 'Algarve, Portugal', 'PT', '2025-10-31', '2025-11-07', 7, 3400, 'GBP', null, null, 'phone' from new_household returning id)
, ins_trip_3 as (insert into trips (agency_id, household_id, reference, stage, destination, destination_country, depart_date, return_date, duration_nights, total_value, currency, occasion, notes, source) select '00000000-0000-0000-0000-000000000001', id, 'TG-2026-160', 'travelling'::trip_stage, 'Dubrovnik, Croatia', 'HR', '2026-05-08', '2026-05-15', 7, 3800, 'GBP', null, null, 'phone' from new_household returning id)
select 1 from new_household;

-- Household: Ahmed Bashir
with new_household as (
  insert into households (
    agency_id, display_name, household_type, city, postcode, country, tags,
    notes, customer_since, lifetime_value, trips_count, next_departure, last_booking_at,
    ai_brief, ai_brief_at
  ) values (
    '00000000-0000-0000-0000-000000000001',
    'Ahmed Bashir',
    'solo',
    'Bournemouth',
    'BH8 9AA',
    'GB',
    '{"New"}'::text[],
    null,
    '2024-04-20',
    12500,
    2,
    null,
    '2025-11-30T00:00:00.000Z',
    null,
    null
  ) returning id
)
, ins_contact_0 as (insert into contacts (agency_id, household_id, role, first_name, last_name, email, phone, date_of_birth, passport_expiry, dietary, flags, marketing_opt_in, marketing_opt_in_at, gdpr_consent, gdpr_consent_at) select '00000000-0000-0000-0000-000000000001', id, 'lead', 'Ahmed', 'Bashir', 'a.bashir@gmail.com', '+44 7700 902123', null, null, null, '{}'::text[], true, '2026-05-09T15:22:35.872Z', true, '2026-05-09T15:22:35.872Z' from new_household returning id)
, ins_trip_1 as (insert into trips (agency_id, household_id, reference, stage, destination, destination_country, depart_date, return_date, duration_nights, total_value, currency, occasion, notes, source) select '00000000-0000-0000-0000-000000000001', id, 'TG-2025-230', 'returned'::trip_stage, 'Istanbul, Turkey', 'TR', '2025-11-30', '2025-12-07', 7, 1900, 'GBP', null, null, 'website' from new_household returning id)
, ins_trip_2 as (insert into trips (agency_id, household_id, reference, stage, destination, destination_country, depart_date, return_date, duration_nights, total_value, currency, occasion, notes, source) select '00000000-0000-0000-0000-000000000001', id, 'TG-2026-170', 'quoted'::trip_stage, 'Jordan & Petra', 'JO', null, null, 9, 2890, 'GBP', null, null, 'website' from new_household returning id)
select 1 from new_household;

-- Household: Whitfield Family
with new_household as (
  insert into households (
    agency_id, display_name, household_type, city, postcode, country, tags,
    notes, customer_since, lifetime_value, trips_count, next_departure, last_booking_at,
    ai_brief, ai_brief_at
  ) values (
    '00000000-0000-0000-0000-000000000001',
    'Whitfield Family',
    'family',
    'New Forest',
    'SO42 7AA',
    'GB',
    '{"Multi-gen","High value"}'::text[],
    null,
    '2016-02-10',
    51200,
    2,
    '2026-09-06',
    '2026-09-06T00:00:00.000Z',
    null,
    null
  ) returning id
)
, ins_contact_0 as (insert into contacts (agency_id, household_id, role, first_name, last_name, email, phone, date_of_birth, passport_expiry, dietary, flags, marketing_opt_in, marketing_opt_in_at, gdpr_consent, gdpr_consent_at) select '00000000-0000-0000-0000-000000000001', id, 'lead', 'Mark', 'Whitfield', 'mark.whitfield@hotmail.com', '+44 7700 902234', null, null, null, '{}'::text[], true, '2026-05-09T15:22:35.872Z', true, '2026-05-09T15:22:35.872Z' from new_household returning id)
, ins_contact_1 as (insert into contacts (agency_id, household_id, role, first_name, last_name, email, phone, date_of_birth, passport_expiry, dietary, flags, marketing_opt_in, marketing_opt_in_at, gdpr_consent, gdpr_consent_at) select '00000000-0000-0000-0000-000000000001', id, 'partner', 'Emma', 'Whitfield', 'emma.w@hotmail.com', '+44 7700 902235', null, null, null, '{}'::text[], true, '2026-05-09T15:22:35.872Z', true, '2026-05-09T15:22:35.872Z' from new_household returning id)
, ins_contact_2 as (insert into contacts (agency_id, household_id, role, first_name, last_name, email, phone, date_of_birth, passport_expiry, dietary, flags, marketing_opt_in, marketing_opt_in_at, gdpr_consent, gdpr_consent_at) select '00000000-0000-0000-0000-000000000001', id, 'child', 'Hugo', 'Whitfield', null, null, '2010-05-30', null, null, '{}'::text[], false, null, false, null from new_household returning id)
, ins_contact_3 as (insert into contacts (agency_id, household_id, role, first_name, last_name, email, phone, date_of_birth, passport_expiry, dietary, flags, marketing_opt_in, marketing_opt_in_at, gdpr_consent, gdpr_consent_at) select '00000000-0000-0000-0000-000000000001', id, 'child', 'Florence', 'Whitfield', null, null, '2013-11-17', null, null, '{}'::text[], false, null, false, null from new_household returning id)
, ins_contact_4 as (insert into contacts (agency_id, household_id, role, first_name, last_name, email, phone, date_of_birth, passport_expiry, dietary, flags, marketing_opt_in, marketing_opt_in_at, gdpr_consent, gdpr_consent_at) select '00000000-0000-0000-0000-000000000001', id, 'dependant', 'Patricia', 'Whitfield', null, null, '1950-07-08', null, null, '{}'::text[], false, null, false, null from new_household returning id)
, ins_contact_5 as (insert into contacts (agency_id, household_id, role, first_name, last_name, email, phone, date_of_birth, passport_expiry, dietary, flags, marketing_opt_in, marketing_opt_in_at, gdpr_consent, gdpr_consent_at) select '00000000-0000-0000-0000-000000000001', id, 'dependant', 'Richard', 'Whitfield', null, null, '1949-11-12', null, null, '{}'::text[], false, null, false, null from new_household returning id)
, ins_trip_6 as (insert into trips (agency_id, household_id, reference, stage, destination, destination_country, depart_date, return_date, duration_nights, total_value, currency, occasion, notes, source) select '00000000-0000-0000-0000-000000000001', id, 'TG-2025-150', 'returned'::trip_stage, 'Jersey', 'JE', '2026-02-08', '2026-02-15', 7, 4800, 'GBP', null, null, 'phone' from new_household returning id)
, ins_trip_7 as (insert into trips (agency_id, household_id, reference, stage, destination, destination_country, depart_date, return_date, duration_nights, total_value, currency, occasion, notes, source) select '00000000-0000-0000-0000-000000000001', id, 'TG-2026-180', 'booked'::trip_stage, 'Costa Brava, Spain', 'ES', '2026-09-06', '2026-09-20', 14, 8100, 'GBP', null, null, 'phone' from new_household returning id)
select 1 from new_household;

-- Household: Christine Parker
with new_household as (
  insert into households (
    agency_id, display_name, household_type, city, postcode, country, tags,
    notes, customer_since, lifetime_value, trips_count, next_departure, last_booking_at,
    ai_brief, ai_brief_at
  ) values (
    '00000000-0000-0000-0000-000000000001',
    'Christine Parker',
    'solo',
    'Poole',
    'BH14 0AA',
    'GB',
    '{"New"}'::text[],
    null,
    '2024-03-15',
    7800,
    1,
    null,
    '2025-04-04T00:00:00.000Z',
    null,
    null
  ) returning id
)
, ins_contact_0 as (insert into contacts (agency_id, household_id, role, first_name, last_name, email, phone, date_of_birth, passport_expiry, dietary, flags, marketing_opt_in, marketing_opt_in_at, gdpr_consent, gdpr_consent_at) select '00000000-0000-0000-0000-000000000001', id, 'lead', 'Christine', 'Parker', 'c.parker@aol.co.uk', '+44 7700 902345', null, null, null, '{}'::text[], true, '2026-05-09T15:22:35.872Z', true, '2026-05-09T15:22:35.872Z' from new_household returning id)
, ins_trip_1 as (insert into trips (agency_id, household_id, reference, stage, destination, destination_country, depart_date, return_date, duration_nights, total_value, currency, occasion, notes, source) select '00000000-0000-0000-0000-000000000001', id, 'TG-2024-310', 'returned'::trip_stage, 'Sorrento, Italy', 'IT', '2025-04-04', '2025-04-11', 7, 2100, 'GBP', null, null, 'website' from new_household returning id)
select 1 from new_household;

-- Household: Reilly-Murphy
with new_household as (
  insert into households (
    agency_id, display_name, household_type, city, postcode, country, tags,
    notes, customer_since, lifetime_value, trips_count, next_departure, last_booking_at,
    ai_brief, ai_brief_at
  ) values (
    '00000000-0000-0000-0000-000000000001',
    'Reilly-Murphy',
    'couple',
    'Bournemouth',
    'BH3 7AA',
    'GB',
    '{"Foodie"}'::text[],
    null,
    '2022-04-30',
    14250,
    2,
    '2026-05-20',
    '2026-05-20T00:00:00.000Z',
    null,
    null
  ) returning id
)
, ins_contact_0 as (insert into contacts (agency_id, household_id, role, first_name, last_name, email, phone, date_of_birth, passport_expiry, dietary, flags, marketing_opt_in, marketing_opt_in_at, gdpr_consent, gdpr_consent_at) select '00000000-0000-0000-0000-000000000001', id, 'lead', 'Sean', 'Reilly-Murphy', 'sean.reilly@gmail.com', '+44 7700 902456', null, null, null, '{}'::text[], true, '2026-05-09T15:22:35.872Z', true, '2026-05-09T15:22:35.872Z' from new_household returning id)
, ins_contact_1 as (insert into contacts (agency_id, household_id, role, first_name, last_name, email, phone, date_of_birth, passport_expiry, dietary, flags, marketing_opt_in, marketing_opt_in_at, gdpr_consent, gdpr_consent_at) select '00000000-0000-0000-0000-000000000001', id, 'partner', 'Aoife', 'Reilly-Murphy', 'aoife.r@gmail.com', '+44 7700 902457', null, null, null, '{}'::text[], true, '2026-05-09T15:22:35.872Z', true, '2026-05-09T15:22:35.872Z' from new_household returning id)
, ins_trip_2 as (insert into trips (agency_id, household_id, reference, stage, destination, destination_country, depart_date, return_date, duration_nights, total_value, currency, occasion, notes, source) select '00000000-0000-0000-0000-000000000001', id, 'TG-2025-260', 'returned'::trip_stage, 'Tuscany, Italy', 'IT', '2025-10-11', '2025-10-18', 7, 4100, 'GBP', null, null, 'phone' from new_household returning id)
, ins_trip_3 as (insert into trips (agency_id, household_id, reference, stage, destination, destination_country, depart_date, return_date, duration_nights, total_value, currency, occasion, notes, source) select '00000000-0000-0000-0000-000000000001', id, 'TG-2026-190', 'pre_departure'::trip_stage, 'San Sebastián, Spain', 'ES', '2026-05-20', '2026-05-27', 7, 2200, 'GBP', null, null, 'phone' from new_household returning id)
select 1 from new_household;

-- Household: Booth Family
with new_household as (
  insert into households (
    agency_id, display_name, household_type, city, postcode, country, tags,
    notes, customer_since, lifetime_value, trips_count, next_departure, last_booking_at,
    ai_brief, ai_brief_at
  ) values (
    '00000000-0000-0000-0000-000000000001',
    'Booth Family',
    'family',
    'Christchurch',
    'BH23 6AA',
    'GB',
    '{"School holiday"}'::text[],
    null,
    '2021-07-15',
    20300,
    2,
    null,
    '2025-06-03T00:00:00.000Z',
    null,
    null
  ) returning id
)
, ins_contact_0 as (insert into contacts (agency_id, household_id, role, first_name, last_name, email, phone, date_of_birth, passport_expiry, dietary, flags, marketing_opt_in, marketing_opt_in_at, gdpr_consent, gdpr_consent_at) select '00000000-0000-0000-0000-000000000001', id, 'lead', 'Jess', 'Booth', 'jess.booth@yahoo.com', '+44 7700 902567', null, null, null, '{}'::text[], true, '2026-05-09T15:22:35.872Z', true, '2026-05-09T15:22:35.872Z' from new_household returning id)
, ins_contact_1 as (insert into contacts (agency_id, household_id, role, first_name, last_name, email, phone, date_of_birth, passport_expiry, dietary, flags, marketing_opt_in, marketing_opt_in_at, gdpr_consent, gdpr_consent_at) select '00000000-0000-0000-0000-000000000001', id, 'partner', 'Daniel', 'Booth', 'd.booth@yahoo.com', '+44 7700 902568', null, null, null, '{}'::text[], true, '2026-05-09T15:22:35.872Z', true, '2026-05-09T15:22:35.872Z' from new_household returning id)
, ins_contact_2 as (insert into contacts (agency_id, household_id, role, first_name, last_name, email, phone, date_of_birth, passport_expiry, dietary, flags, marketing_opt_in, marketing_opt_in_at, gdpr_consent, gdpr_consent_at) select '00000000-0000-0000-0000-000000000001', id, 'child', 'Toby', 'Booth', null, null, '2013-04-04', null, null, '{}'::text[], false, null, false, null from new_household returning id)
, ins_contact_3 as (insert into contacts (agency_id, household_id, role, first_name, last_name, email, phone, date_of_birth, passport_expiry, dietary, flags, marketing_opt_in, marketing_opt_in_at, gdpr_consent, gdpr_consent_at) select '00000000-0000-0000-0000-000000000001', id, 'child', 'Maisie', 'Booth', null, null, '2015-08-19', null, null, '{}'::text[], false, null, false, null from new_household returning id)
, ins_trip_4 as (insert into trips (agency_id, household_id, reference, stage, destination, destination_country, depart_date, return_date, duration_nights, total_value, currency, occasion, notes, source) select '00000000-0000-0000-0000-000000000001', id, 'TG-2024-280', 'returned'::trip_stage, 'Costa del Sol, Spain', 'ES', '2025-06-03', '2025-06-10', 7, 3200, 'GBP', null, null, 'phone' from new_household returning id)
, ins_trip_5 as (insert into trips (agency_id, household_id, reference, stage, destination, destination_country, depart_date, return_date, duration_nights, total_value, currency, occasion, notes, source) select '00000000-0000-0000-0000-000000000001', id, 'TG-2026-200', 'enquiry'::trip_stage, 'Costa Brava, Spain', 'ES', null, null, null, 4200, 'GBP', null, null, 'phone' from new_household returning id)
select 1 from new_household;

-- Household: Mr & Mrs Hossain
with new_household as (
  insert into households (
    agency_id, display_name, household_type, city, postcode, country, tags,
    notes, customer_since, lifetime_value, trips_count, next_departure, last_booking_at,
    ai_brief, ai_brief_at
  ) values (
    '00000000-0000-0000-0000-000000000001',
    'Mr & Mrs Hossain',
    'couple',
    'Southampton',
    'SO16 4AA',
    'GB',
    '{"Anniversary"}'::text[],
    null,
    '2020-11-20',
    17400,
    2,
    '2026-08-12',
    '2026-08-12T00:00:00.000Z',
    null,
    null
  ) returning id
)
, ins_contact_0 as (insert into contacts (agency_id, household_id, role, first_name, last_name, email, phone, date_of_birth, passport_expiry, dietary, flags, marketing_opt_in, marketing_opt_in_at, gdpr_consent, gdpr_consent_at) select '00000000-0000-0000-0000-000000000001', id, 'lead', 'Mahmud', 'Hossain', 'm.hossain@gmail.com', '+44 7700 902678', null, null, null, '{}'::text[], true, '2026-05-09T15:22:35.872Z', true, '2026-05-09T15:22:35.872Z' from new_household returning id)
, ins_contact_1 as (insert into contacts (agency_id, household_id, role, first_name, last_name, email, phone, date_of_birth, passport_expiry, dietary, flags, marketing_opt_in, marketing_opt_in_at, gdpr_consent, gdpr_consent_at) select '00000000-0000-0000-0000-000000000001', id, 'partner', 'Salma', 'Hossain', 'salma.h@gmail.com', '+44 7700 902679', null, null, null, '{}'::text[], true, '2026-05-09T15:22:35.872Z', true, '2026-05-09T15:22:35.872Z' from new_household returning id)
, ins_trip_2 as (insert into trips (agency_id, household_id, reference, stage, destination, destination_country, depart_date, return_date, duration_nights, total_value, currency, occasion, notes, source) select '00000000-0000-0000-0000-000000000001', id, 'TG-2025-310', 'returned'::trip_stage, 'Paris, France', 'FR', '2026-01-29', '2026-02-03', 5, 2300, 'GBP', null, null, 'phone' from new_household returning id)
, ins_trip_3 as (insert into trips (agency_id, household_id, reference, stage, destination, destination_country, depart_date, return_date, duration_nights, total_value, currency, occasion, notes, source) select '00000000-0000-0000-0000-000000000001', id, 'TG-2026-210', 'booked'::trip_stage, 'Vietnam', 'VN', '2026-08-12', '2026-08-26', 14, 5600, 'GBP', 'anniversary', null, 'phone' from new_household returning id)
select 1 from new_household;

-- Household: Geoffrey Holloway
with new_household as (
  insert into households (
    agency_id, display_name, household_type, city, postcode, country, tags,
    notes, customer_since, lifetime_value, trips_count, next_departure, last_booking_at,
    ai_brief, ai_brief_at
  ) values (
    '00000000-0000-0000-0000-000000000001',
    'Geoffrey Holloway',
    'solo',
    'Wareham',
    'BH20 6AA',
    'GB',
    '{"VIP"}'::text[],
    null,
    '2016-06-04',
    28900,
    2,
    null,
    '2026-05-05T00:00:00.000Z',
    null,
    null
  ) returning id
)
, ins_contact_0 as (insert into contacts (agency_id, household_id, role, first_name, last_name, email, phone, date_of_birth, passport_expiry, dietary, flags, marketing_opt_in, marketing_opt_in_at, gdpr_consent, gdpr_consent_at) select '00000000-0000-0000-0000-000000000001', id, 'lead', 'Geoffrey', 'Holloway', 'geoff.holloway@btopenworld.com', '+44 7700 902789', '1955-09-11', '2026-08-23', null, '{}'::text[], true, '2026-05-09T15:22:35.872Z', true, '2026-05-09T15:22:35.872Z' from new_household returning id)
, ins_trip_1 as (insert into trips (agency_id, household_id, reference, stage, destination, destination_country, depart_date, return_date, duration_nights, total_value, currency, occasion, notes, source) select '00000000-0000-0000-0000-000000000001', id, 'TG-2025-090', 'returned'::trip_stage, 'Antarctica', 'AQ', '2026-01-09', '2026-01-23', 14, 14500, 'GBP', null, null, 'phone' from new_household returning id)
, ins_trip_2 as (insert into trips (agency_id, household_id, reference, stage, destination, destination_country, depart_date, return_date, duration_nights, total_value, currency, occasion, notes, source) select '00000000-0000-0000-0000-000000000001', id, 'TG-2026-220', 'travelling'::trip_stage, 'Japan', 'JP', '2026-05-05', '2026-05-19', 14, 11800, 'GBP', null, null, 'phone' from new_household returning id)
select 1 from new_household;

-- Household: The Smiths
with new_household as (
  insert into households (
    agency_id, display_name, household_type, city, postcode, country, tags,
    notes, customer_since, lifetime_value, trips_count, next_departure, last_booking_at,
    ai_brief, ai_brief_at
  ) values (
    '00000000-0000-0000-0000-000000000001',
    'The Smiths',
    'family',
    'Bournemouth',
    'BH10 4AA',
    'GB',
    '{"Repeat"}'::text[],
    null,
    '2018-08-22',
    32600,
    2,
    '2026-05-17',
    '2026-05-17T00:00:00.000Z',
    null,
    null
  ) returning id
)
, ins_contact_0 as (insert into contacts (agency_id, household_id, role, first_name, last_name, email, phone, date_of_birth, passport_expiry, dietary, flags, marketing_opt_in, marketing_opt_in_at, gdpr_consent, gdpr_consent_at) select '00000000-0000-0000-0000-000000000001', id, 'lead', 'Anna', 'Smith', 'a.smith@hotmail.co.uk', '+44 7700 902890', null, null, null, '{}'::text[], true, '2026-05-09T15:22:35.872Z', true, '2026-05-09T15:22:35.872Z' from new_household returning id)
, ins_contact_1 as (insert into contacts (agency_id, household_id, role, first_name, last_name, email, phone, date_of_birth, passport_expiry, dietary, flags, marketing_opt_in, marketing_opt_in_at, gdpr_consent, gdpr_consent_at) select '00000000-0000-0000-0000-000000000001', id, 'partner', 'Paul', 'Smith', 'p.smith@hotmail.co.uk', '+44 7700 902891', null, null, null, '{}'::text[], true, '2026-05-09T15:22:35.872Z', true, '2026-05-09T15:22:35.872Z' from new_household returning id)
, ins_contact_2 as (insert into contacts (agency_id, household_id, role, first_name, last_name, email, phone, date_of_birth, passport_expiry, dietary, flags, marketing_opt_in, marketing_opt_in_at, gdpr_consent, gdpr_consent_at) select '00000000-0000-0000-0000-000000000001', id, 'child', 'Isla', 'Smith', null, null, '2010-02-25', null, null, '{}'::text[], false, null, false, null from new_household returning id)
, ins_contact_3 as (insert into contacts (agency_id, household_id, role, first_name, last_name, email, phone, date_of_birth, passport_expiry, dietary, flags, marketing_opt_in, marketing_opt_in_at, gdpr_consent, gdpr_consent_at) select '00000000-0000-0000-0000-000000000001', id, 'child', 'Ethan', 'Smith', null, null, '2013-06-11', null, null, '{}'::text[], false, null, false, null from new_household returning id)
, ins_contact_4 as (insert into contacts (agency_id, household_id, role, first_name, last_name, email, phone, date_of_birth, passport_expiry, dietary, flags, marketing_opt_in, marketing_opt_in_at, gdpr_consent, gdpr_consent_at) select '00000000-0000-0000-0000-000000000001', id, 'child', 'Freya', 'Smith', null, null, '2016-10-29', null, null, '{}'::text[], false, null, false, null from new_household returning id)
, ins_trip_5 as (insert into trips (agency_id, household_id, reference, stage, destination, destination_country, depart_date, return_date, duration_nights, total_value, currency, occasion, notes, source) select '00000000-0000-0000-0000-000000000001', id, 'TG-2025-275', 'returned'::trip_stage, 'Lake District', 'GB', '2025-08-12', '2025-08-19', 7, 1900, 'GBP', null, null, 'phone' from new_household returning id)
, ins_trip_6 as (insert into trips (agency_id, household_id, reference, stage, destination, destination_country, depart_date, return_date, duration_nights, total_value, currency, occasion, notes, source) select '00000000-0000-0000-0000-000000000001', id, 'TG-2026-230', 'pre_departure'::trip_stage, 'Cape Verde', 'CV', '2026-05-17', '2026-05-27', 10, 4800, 'GBP', null, null, 'phone' from new_household returning id)
select 1 from new_household;

-- Household: Imogen Castle
with new_household as (
  insert into households (
    agency_id, display_name, household_type, city, postcode, country, tags,
    notes, customer_since, lifetime_value, trips_count, next_departure, last_booking_at,
    ai_brief, ai_brief_at
  ) values (
    '00000000-0000-0000-0000-000000000001',
    'Imogen Castle',
    'solo',
    'Lymington',
    'SO41 8AA',
    'GB',
    '{"Wellness"}'::text[],
    null,
    '2023-02-14',
    13800,
    1,
    null,
    '2025-08-02T00:00:00.000Z',
    null,
    null
  ) returning id
)
, ins_contact_0 as (insert into contacts (agency_id, household_id, role, first_name, last_name, email, phone, date_of_birth, passport_expiry, dietary, flags, marketing_opt_in, marketing_opt_in_at, gdpr_consent, gdpr_consent_at) select '00000000-0000-0000-0000-000000000001', id, 'lead', 'Imogen', 'Castle', 'imogen.castle@gmail.com', '+44 7700 902901', null, null, null, '{}'::text[], true, '2026-05-09T15:22:35.872Z', true, '2026-05-09T15:22:35.872Z' from new_household returning id)
, ins_trip_1 as (insert into trips (agency_id, household_id, reference, stage, destination, destination_country, depart_date, return_date, duration_nights, total_value, currency, occasion, notes, source) select '00000000-0000-0000-0000-000000000001', id, 'TG-2025-340', 'returned'::trip_stage, 'Bali Wellness Retreat', 'ID', '2025-08-02', '2025-08-12', 10, 3400, 'GBP', 'wellness retreat', null, 'phone' from new_household returning id)
select 1 from new_household;
