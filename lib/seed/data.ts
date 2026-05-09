/**
 * Seed data — single source of truth.
 *
 * Used by:
 *   - app/api/seed/route.ts (one-click seed via the running app)
 *   - scripts/generate-seed-sql.ts (regenerates supabase/seed.sql when this changes)
 *
 * Names mirror the mockup so the demo feels continuous between mock and live.
 * Bournemouth-area cities. UK phone numbers. Realistic email patterns.
 *
 * Date anchoring: we use a fixed "now" offset model so the data stays coherent
 * — Sarah Thompson is always "departing in 3 days" relative to whenever you
 * seed. This means we can re-seed at any time and the demo still tells the
 * same story.
 */

export type SeedHousehold = {
  display_name: string;
  household_type: 'family' | 'couple' | 'solo' | 'group';
  city: string;
  postcode: string;
  tags: string[];
  customer_since: string;          // YYYY-MM-DD
  lifetime_value: number;
  contacts: SeedContact[];
  trips: SeedTrip[];
  interactions?: SeedInteraction[];
  preferences?: SeedPreference[];
  notes?: string;
  ai_brief?: string;
};

export type SeedContact = {
  role: 'lead' | 'partner' | 'child' | 'dependant' | 'other';
  first_name: string;
  last_name: string;
  email?: string;
  phone?: string;
  date_of_birth?: string;
  passport_expiry?: string;
  dietary?: string;
  flags?: string[];
  marketing_opt_in?: boolean;
  gdpr_consent?: boolean;
};

export type SeedTrip = {
  reference: string;
  stage: 'enquiry' | 'quoted' | 'booked' | 'pre_departure' | 'travelling' | 'returned' | 'cancelled';
  destination: string;
  destination_country: string;
  depart_offset_days: number | null;   // relative to today; null for enquiries
  return_offset_days: number | null;
  duration_nights?: number;
  total_value: number;
  occasion?: string;
  source: 'widget_enquiry' | 'phone' | 'walk_in' | 'referral' | 'website';
  notes?: string;
};

export type SeedInteraction = {
  kind: 'email_in' | 'email_out' | 'chat' | 'enquiry' | 'call' | 'note' | 'system';
  channel: 'email' | 'live_chat' | 'whatsapp' | 'phone' | 'web_form' | null;
  direction: 'inbound' | 'outbound' | 'internal';
  subject?: string;
  body: string;
  body_summary?: string;
  ai_priority?: 'today' | 'week' | 'later';
  ai_reason?: string;
  occurred_offset_hours: number;     // relative to now (negative = past)
  is_read?: boolean;
};

export type SeedPreference = {
  category: 'airline' | 'seat' | 'room' | 'dietary' | 'budget' | 'avoid' | 'style' | 'other';
  value: string;
  source?: 'manual' | 'inferred' | 'survey';
};

// ─── Suppliers (small set, referenced by some trips) ───────────────────
export const SEED_SUPPLIERS = [
  { name: 'Jet2 Holidays', category: 'tour_operator', rating: 4.6 },
  { name: 'TUI', category: 'tour_operator', rating: 4.2 },
  { name: 'BA Holidays', category: 'tour_operator', rating: 4.4 },
  { name: 'Hotelbeds', category: 'hotel', rating: 4.0 },
  { name: 'WebBeds', category: 'hotel', rating: 4.1 },
  { name: 'InterMyt', category: 'transfer', rating: 4.7, flags: ['preferred'] },
  { name: 'Olympic Holidays Transfers', category: 'transfer', rating: 2.8, flags: ['avoid'] },
  { name: 'Holiday Taxis', category: 'transfer', rating: 4.3 },
  { name: 'Jet2 Insurance', category: 'insurance', rating: 4.5 },
];

// ─── Households (30) ───────────────────────────────────────────────────
export const SEED_HOUSEHOLDS: SeedHousehold[] = [
  // 1 — Sarah Thompson family — the exemplar customer
  {
    display_name: 'Sarah & James Thompson',
    household_type: 'family',
    city: 'Bournemouth',
    postcode: 'BH1 2AA',
    tags: ['VIP', 'Repeat'],
    customer_since: '2019-04-12',
    lifetime_value: 24580,
    notes: 'Bad transfer in Crete 2024 with Olympic Holidays. Switched to InterMyt. Watch the family on every transfer booking.',
    ai_brief: 'Sarah and James are seven-year customers, family of four, two boys (Oliver 12, Henry 9). They book annually in summer, big trips for milestones. They love boutique over mass-market, water-based activities, and good food. Sarah handles all comms; James is quieter but the decision-maker on price.',
    contacts: [
      { role: 'lead', first_name: 'Sarah', last_name: 'Thompson', email: 'sarah.thompson@gmail.com', phone: '+44 7700 900123', date_of_birth: '1985-06-14', passport_expiry: '2029-08-21', marketing_opt_in: true, gdpr_consent: true },
      { role: 'partner', first_name: 'James', last_name: 'Thompson', email: 'j.thompson@gmail.com', phone: '+44 7700 900124', date_of_birth: '1983-02-08', passport_expiry: '2029-08-21', marketing_opt_in: true, gdpr_consent: true },
      { role: 'child', first_name: 'Oliver', last_name: 'Thompson', date_of_birth: '2014-03-22', passport_expiry: '2029-09-14' },
      { role: 'child', first_name: 'Henry', last_name: 'Thompson', date_of_birth: '2017-07-09', passport_expiry: '2029-09-14', dietary: 'nut allergy', flags: ['allergy'] },
    ],
    trips: [
      { reference: 'TG-2026-001', stage: 'travelling', destination: 'Crete, Greece', destination_country: 'GR', depart_offset_days: -4, return_offset_days: 3, duration_nights: 7, total_value: 8400, occasion: 'family summer', source: 'phone' },
      { reference: 'TG-2026-002', stage: 'pre_departure', destination: 'Maldives — Vakkaru', destination_country: 'MV', depart_offset_days: 3, return_offset_days: 10, duration_nights: 7, total_value: 12400, occasion: 'anniversary', source: 'phone' },
      { reference: 'TG-2025-088', stage: 'returned', destination: 'Banff & Lake Louise, Canada', destination_country: 'CA', depart_offset_days: -260, return_offset_days: -245, duration_nights: 14, total_value: 9200, occasion: 'family summer', source: 'phone' },
    ],
    preferences: [
      { category: 'style', value: 'Boutique & small luxury' },
      { category: 'airline', value: 'BA / Emirates' },
      { category: 'seat', value: 'Window · together as family' },
      { category: 'room', value: 'Sea view · adjoining' },
      { category: 'budget', value: 'Flexible for milestones' },
      { category: 'avoid', value: 'Olympic Holidays (transfers)' },
    ],
    interactions: [
      { kind: 'email_in', channel: 'email', direction: 'inbound', subject: 'Quick question about transfers in Maldives',
        body: 'Hi Andy! Really excited for our trip on Tuesday. Quick one — will the speedboat transfer wait if our flight is delayed? We had a nightmare in 2024 when our transfer left without us in Crete and we ended up in a taxi. Don\'t want a repeat with the kids and all the bags. Thanks! Sarah',
        body_summary: 'Worried about the Maldives speedboat transfer waiting if her flight is delayed, referencing a bad Crete 2024 experience. Wants reassurance, not detail.',
        ai_priority: 'today', ai_reason: 'Departing Tue · £12,400 trip · referencing past bad experience',
        occurred_offset_hours: -0.2, is_read: false },
      { kind: 'email_out', channel: 'email', direction: 'outbound', subject: 'Re: Final document pack',
        body: 'Sarah, attached are your e-tickets, hotel vouchers, transfer confirmations and travel insurance. Pre-departure call held for tomorrow at 14:00. Andy',
        occurred_offset_hours: -16, is_read: true },
      { kind: 'chat', channel: 'live_chat', direction: 'inbound', subject: 'Anniversary dinner reservation',
        body: 'Andy, did Vakkaru confirm the Ithaa Undersea booking for night 3? Want to keep it as a surprise from James.',
        body_summary: 'Confirming the anniversary dinner reservation Sarah wants to surprise James with on night 3.',
        occurred_offset_hours: -97, is_read: true },
    ],
  },

  // 2 — Margaret Collins — solo, repeat
  {
    display_name: 'Margaret Collins',
    household_type: 'solo',
    city: 'Poole',
    postcode: 'BH15 1AB',
    tags: ['Repeat'],
    customer_since: '2017-09-01',
    lifetime_value: 18420,
    contacts: [
      { role: 'lead', first_name: 'Margaret', last_name: 'Collins', email: 'margaret.collins@outlook.com', phone: '+44 7700 900245', date_of_birth: '1956-11-03', passport_expiry: '2028-04-19', marketing_opt_in: true, gdpr_consent: true },
    ],
    trips: [
      { reference: 'TG-2025-101', stage: 'returned', destination: 'Cyprus', destination_country: 'CY', depart_offset_days: -340, return_offset_days: -333, duration_nights: 7, total_value: 1620, source: 'phone' },
      { reference: 'TG-2026-014', stage: 'pre_departure', destination: 'Madeira', destination_country: 'PT', depart_offset_days: 7, return_offset_days: 14, duration_nights: 7, total_value: 1840, source: 'phone' },
    ],
    interactions: [
      { kind: 'chat', channel: 'live_chat', direction: 'inbound', subject: 'Madeira final docs',
        body: 'Hi Andy, I just wanted to check the airport hotel I asked about — the one in Funchal — is that confirmed for the night before our flight back?',
        body_summary: 'Checking confirmation of the Funchal airport hotel for her last night.',
        ai_priority: 'today', ai_reason: 'Departs in 7 days · simple confirmation needed',
        occurred_offset_hours: -1, is_read: false },
    ],
  },

  // 3 — Patel Family — high-value, warming up
  {
    display_name: 'Patel Family',
    household_type: 'family',
    city: 'Southampton',
    postcode: 'SO14 7AB',
    tags: ['High value'],
    customer_since: '2018-06-22',
    lifetime_value: 42100,
    contacts: [
      { role: 'lead', first_name: 'Rajesh', last_name: 'Patel', email: 'rajesh.patel@hotmail.com', phone: '+44 7700 900567', marketing_opt_in: true, gdpr_consent: true },
      { role: 'partner', first_name: 'Priya', last_name: 'Patel', email: 'priya.p@hotmail.com', phone: '+44 7700 900568', marketing_opt_in: true, gdpr_consent: true },
      { role: 'child', first_name: 'Arjun', last_name: 'Patel', date_of_birth: '2010-09-12' },
      { role: 'child', first_name: 'Anika', last_name: 'Patel', date_of_birth: '2013-01-30' },
      { role: 'child', first_name: 'Vikram', last_name: 'Patel', date_of_birth: '2016-05-18' },
    ],
    trips: [
      { reference: 'TG-2025-077', stage: 'returned', destination: 'Dubai', destination_country: 'AE', depart_offset_days: -180, return_offset_days: -170, duration_nights: 10, total_value: 11800, source: 'phone' },
      { reference: 'TG-2026-022', stage: 'enquiry', destination: 'Sardinia, Italy', destination_country: 'IT', depart_offset_days: null, return_offset_days: null, total_value: 8400, source: 'phone' },
    ],
    interactions: [
      { kind: 'email_in', channel: 'email', direction: 'inbound', subject: 'Re: Sardinia options for July',
        body: 'Thanks for the three options. We discussed it as a family and lean toward the second one, but want to know if you can tweak the dates by a week and add a private chef for one evening.',
        body_summary: 'Patels favour option 2 of Sardinia trip, want a date tweak and a private chef added.',
        ai_priority: 'week', ai_reason: 'Warming up · opened quote 4× · close-able with one tweak',
        occurred_offset_hours: -3, is_read: true },
    ],
  },

  // 4 — Walsh — couple, returned, honeymoon
  {
    display_name: 'David & Susan Walsh',
    household_type: 'couple',
    city: 'Christchurch',
    postcode: 'BH23 1AB',
    tags: ['Honeymoon'],
    customer_since: '2020-02-14',
    lifetime_value: 31250,
    contacts: [
      { role: 'lead', first_name: 'David', last_name: 'Walsh', email: 'd.walsh@btinternet.com', phone: '+44 7700 900789', marketing_opt_in: true, gdpr_consent: true },
      { role: 'partner', first_name: 'Susan', last_name: 'Walsh', email: 's.walsh@btinternet.com', phone: '+44 7700 900790', marketing_opt_in: true, gdpr_consent: true },
    ],
    trips: [
      { reference: 'TG-2025-040', stage: 'returned', destination: 'Bali, Indonesia', destination_country: 'ID', depart_offset_days: -370, return_offset_days: -355, duration_nights: 14, total_value: 7200, occasion: 'honeymoon', source: 'phone' },
    ],
  },

  // 5 — Andrew McKenzie — solo, quoted, adventurous
  {
    display_name: 'Andrew McKenzie',
    household_type: 'solo',
    city: 'Bournemouth',
    postcode: 'BH8 8AA',
    tags: ['New'],
    customer_since: '2024-11-10',
    lifetime_value: 8900,
    contacts: [
      { role: 'lead', first_name: 'Andrew', last_name: 'McKenzie', email: 'andrew.m@gmail.com', phone: '+44 7700 900234', marketing_opt_in: true, gdpr_consent: true },
    ],
    trips: [
      { reference: 'TG-2025-130', stage: 'returned', destination: 'Iceland', destination_country: 'IS', depart_offset_days: -540, return_offset_days: -533, duration_nights: 7, total_value: 2400, source: 'website' },
      { reference: 'TG-2026-045', stage: 'quoted', destination: 'Costa Rica', destination_country: 'CR', depart_offset_days: null, return_offset_days: null, duration_nights: 12, total_value: 4650, source: 'website' },
    ],
    interactions: [
      { kind: 'email_in', channel: 'email', direction: 'inbound', subject: 'Re: Costa Rica itinerary version 3',
        body: 'Looks great. The Manuel Antonio bit looks perfect. One ask — can we add a day in the cloud forest at Monteverde? I read it\'s incredible.',
        ai_priority: 'week', ai_reason: 'Engaged buyer · easy itinerary tweak · close this week',
        occurred_offset_hours: -8, is_read: true },
    ],
  },

  // 6 — Nguyen family
  {
    display_name: 'The Nguyen Family',
    household_type: 'family',
    city: 'Salisbury',
    postcode: 'SP1 1AA',
    tags: ['Repeat'],
    customer_since: '2021-04-04',
    lifetime_value: 19840,
    contacts: [
      { role: 'lead', first_name: 'Minh', last_name: 'Nguyen', email: 'minh.nguyen@yahoo.co.uk', phone: '+44 7700 900345', marketing_opt_in: true, gdpr_consent: true },
      { role: 'partner', first_name: 'Linh', last_name: 'Nguyen', email: 'linh.n@yahoo.co.uk', phone: '+44 7700 900346', marketing_opt_in: true, gdpr_consent: true },
      { role: 'child', first_name: 'Khanh', last_name: 'Nguyen', date_of_birth: '2012-07-15' },
      { role: 'child', first_name: 'An', last_name: 'Nguyen', date_of_birth: '2015-11-02' },
    ],
    trips: [
      { reference: 'TG-2025-095', stage: 'returned', destination: 'Mallorca, Spain', destination_country: 'ES', depart_offset_days: -290, return_offset_days: -283, duration_nights: 7, total_value: 4100, source: 'phone' },
      { reference: 'TG-2026-058', stage: 'booked', destination: 'Tenerife, Spain', destination_country: 'ES', depart_offset_days: 89, return_offset_days: 96, duration_nights: 7, total_value: 3290, source: 'phone' },
    ],
  },

  // 7 — Helen Ashworth — solo adventure
  {
    display_name: 'Helen Ashworth',
    household_type: 'solo',
    city: 'New Forest',
    postcode: 'SO43 7BD',
    tags: ['Adventure'],
    customer_since: '2022-08-30',
    lifetime_value: 14260,
    contacts: [
      { role: 'lead', first_name: 'Helen', last_name: 'Ashworth', email: 'helen.ashworth@gmail.com', phone: '+44 7700 900456', date_of_birth: '1974-05-09', marketing_opt_in: true, gdpr_consent: true },
    ],
    trips: [
      { reference: 'TG-2025-115', stage: 'returned', destination: 'Patagonia, Argentina', destination_country: 'AR', depart_offset_days: -120, return_offset_days: -106, duration_nights: 14, total_value: 5800, source: 'phone' },
      { reference: 'TG-2026-061', stage: 'pre_departure', destination: 'Faroe Islands', destination_country: 'FO', depart_offset_days: 14, return_offset_days: 21, duration_nights: 7, total_value: 2600, source: 'phone' },
    ],
    interactions: [
      { kind: 'email_in', channel: 'email', direction: 'inbound', subject: 'Re: Faroe Islands packing list',
        body: 'Brilliant, thanks for the list. Already have most things, will need to grab proper waterproof boots. The car hire is sorted then yes?',
        ai_priority: 'week', ai_reason: 'Polite check-in · 14 days to departure · low urgency',
        occurred_offset_hours: -5, is_read: true },
    ],
  },

  // 8 — Bevan couple, anniversary
  {
    display_name: 'Simon & Rachel Bevan',
    household_type: 'couple',
    city: 'Wimborne',
    postcode: 'BH21 1AA',
    tags: ['Anniversary'],
    customer_since: '2019-10-15',
    lifetime_value: 22150,
    contacts: [
      { role: 'lead', first_name: 'Simon', last_name: 'Bevan', email: 's.bevan@icloud.com', phone: '+44 7700 900678', marketing_opt_in: true, gdpr_consent: true },
      { role: 'partner', first_name: 'Rachel', last_name: 'Bevan', email: 'r.bevan@icloud.com', phone: '+44 7700 900679', marketing_opt_in: true, gdpr_consent: true },
    ],
    trips: [
      { reference: 'TG-2024-203', stage: 'returned', destination: 'Santorini, Greece', destination_country: 'GR', depart_offset_days: -380, return_offset_days: -373, duration_nights: 7, total_value: 5800, source: 'phone' },
      { reference: 'TG-2026-070', stage: 'enquiry', destination: 'Mykonos, Greece', destination_country: 'GR', depart_offset_days: null, return_offset_days: null, total_value: 3800, occasion: 'anniversary', source: 'phone' },
    ],
  },

  // 9 — Edwards multi-gen
  {
    display_name: 'Edwards Family',
    household_type: 'family',
    city: 'Bournemouth',
    postcode: 'BH4 9AA',
    tags: ['Multi-gen'],
    customer_since: '2018-03-18',
    lifetime_value: 38900,
    contacts: [
      { role: 'lead', first_name: 'Lucy', last_name: 'Edwards', email: 'lucy.edwards@hotmail.co.uk', phone: '+44 7700 900890', marketing_opt_in: true, gdpr_consent: true },
      { role: 'partner', first_name: 'Mark', last_name: 'Edwards', email: 'm.edwards@hotmail.co.uk', phone: '+44 7700 900891', marketing_opt_in: true, gdpr_consent: true },
      { role: 'child', first_name: 'Sophie', last_name: 'Edwards', date_of_birth: '2009-04-21' },
      { role: 'child', first_name: 'Jacob', last_name: 'Edwards', date_of_birth: '2011-08-13' },
      { role: 'dependant', first_name: 'Brenda', last_name: 'Edwards', date_of_birth: '1948-12-04' },
      { role: 'dependant', first_name: 'Geoffrey', last_name: 'Edwards', date_of_birth: '1946-06-22' },
    ],
    trips: [
      { reference: 'TG-2025-085', stage: 'returned', destination: 'Lanzarote', destination_country: 'ES', depart_offset_days: -200, return_offset_days: -193, duration_nights: 7, total_value: 4900, source: 'phone' },
      { reference: 'TG-2026-080', stage: 'booked', destination: 'Algarve, Portugal', destination_country: 'PT', depart_offset_days: 45, return_offset_days: 55, duration_nights: 10, total_value: 6800, source: 'phone' },
    ],
  },

  // 10 — Robert Hargreaves — VIP solo
  {
    display_name: 'Robert Hargreaves',
    household_type: 'solo',
    city: 'Bournemouth',
    postcode: 'BH2 5AA',
    tags: ['VIP'],
    customer_since: '2015-07-09',
    lifetime_value: 47200,
    contacts: [
      { role: 'lead', first_name: 'Robert', last_name: 'Hargreaves', email: 'r.hargreaves@gmail.com', phone: '+44 7700 900901', marketing_opt_in: true, gdpr_consent: true },
    ],
    trips: [
      { reference: 'TG-2026-005', stage: 'travelling', destination: 'Maldives', destination_country: 'MV', depart_offset_days: -2, return_offset_days: 8, duration_nights: 10, total_value: 15200, source: 'phone' },
      { reference: 'TG-2025-005', stage: 'returned', destination: 'Galápagos', destination_country: 'EC', depart_offset_days: -180, return_offset_days: -167, duration_nights: 13, total_value: 18000, source: 'phone' },
    ],
  },

  // 11 — Olivia Carr — new lead, honeymoon enquiry
  {
    display_name: 'Olivia Carr',
    household_type: 'solo',
    city: 'Lymington',
    postcode: 'SO41 9AA',
    tags: ['New'],
    customer_since: '2026-05-09',
    lifetime_value: 0,
    contacts: [
      { role: 'lead', first_name: 'Olivia', last_name: 'Carr', email: 'olivia.c.carr@yahoo.com', phone: '+44 7700 901012', marketing_opt_in: true, gdpr_consent: true },
    ],
    trips: [
      { reference: 'TG-2026-100', stage: 'enquiry', destination: 'Tulum, Mexico', destination_country: 'MX', depart_offset_days: null, return_offset_days: null, duration_nights: 14, total_value: 3200, occasion: 'honeymoon', source: 'widget_enquiry' },
    ],
    interactions: [
      { kind: 'enquiry', channel: 'web_form', direction: 'inbound', subject: 'Tulum honeymoon — first enquiry',
        body: 'Submitted via website enquiry form. Looking for 14-night honeymoon in Tulum, October-ish, mid-range budget around £3-4k for two. Would love beachfront with a good vibe, not too party-heavy.',
        ai_priority: 'today', ai_reason: 'New lead · 38 min old · honeymoons close fast',
        occurred_offset_hours: -0.6, is_read: false },
    ],
  },

  // 12 — Williams-Hughes
  {
    display_name: 'Williams-Hughes',
    household_type: 'family',
    city: 'Ringwood',
    postcode: 'BH24 1AA',
    tags: ['Repeat'],
    customer_since: '2020-05-05',
    lifetime_value: 27400,
    contacts: [
      { role: 'lead', first_name: 'Gareth', last_name: 'Williams-Hughes', email: 'g.williams@hotmail.com', phone: '+44 7700 901123', marketing_opt_in: true, gdpr_consent: true },
      { role: 'partner', first_name: 'Eleri', last_name: 'Williams-Hughes', email: 'e.williams@hotmail.com', phone: '+44 7700 901124', marketing_opt_in: true, gdpr_consent: true },
      { role: 'child', first_name: 'Megan', last_name: 'Williams-Hughes', date_of_birth: '2013-02-14' },
      { role: 'child', first_name: 'Owen', last_name: 'Williams-Hughes', date_of_birth: '2016-10-08' },
    ],
    trips: [
      { reference: 'TG-2025-152', stage: 'returned', destination: 'Cornwall', destination_country: 'GB', depart_offset_days: -250, return_offset_days: -243, duration_nights: 7, total_value: 1800, source: 'phone' },
      { reference: 'TG-2026-110', stage: 'pre_departure', destination: 'Crete, Greece', destination_country: 'GR', depart_offset_days: 10, return_offset_days: 17, duration_nights: 7, total_value: 4650, source: 'phone' },
    ],
  },

  // 13 — Tom & Lisa Bryant — babymoon
  {
    display_name: 'Tom & Lisa Bryant',
    household_type: 'couple',
    city: 'Verwood',
    postcode: 'BH31 1AA',
    tags: ['Babymoon'],
    customer_since: '2023-01-20',
    lifetime_value: 16800,
    contacts: [
      { role: 'lead', first_name: 'Tom', last_name: 'Bryant', email: 'tom.bryant@gmail.com', phone: '+44 7700 901234', marketing_opt_in: true, gdpr_consent: true },
      { role: 'partner', first_name: 'Lisa', last_name: 'Bryant', email: 'l.bryant@gmail.com', phone: '+44 7700 901235', marketing_opt_in: true, gdpr_consent: true },
    ],
    trips: [
      { reference: 'TG-2024-145', stage: 'returned', destination: 'Mauritius', destination_country: 'MU', depart_offset_days: -450, return_offset_days: -440, duration_nights: 10, total_value: 6400, occasion: 'babymoon', source: 'phone' },
    ],
  },

  // 14 — Akinwale family — cultural
  {
    display_name: 'Akinwale Family',
    household_type: 'family',
    city: 'Bournemouth',
    postcode: 'BH9 2AA',
    tags: ['Cultural'],
    customer_since: '2023-06-03',
    lifetime_value: 11200,
    contacts: [
      { role: 'lead', first_name: 'Tunde', last_name: 'Akinwale', email: 'tunde.akinwale@gmail.com', phone: '+44 7700 901345', marketing_opt_in: true, gdpr_consent: true },
      { role: 'partner', first_name: 'Funke', last_name: 'Akinwale', email: 'funke.a@gmail.com', phone: '+44 7700 901346', marketing_opt_in: true, gdpr_consent: true },
      { role: 'child', first_name: 'Ade', last_name: 'Akinwale', date_of_birth: '2014-09-25' },
    ],
    trips: [
      { reference: 'TG-2025-160', stage: 'returned', destination: 'Lagos, Nigeria', destination_country: 'NG', depart_offset_days: -200, return_offset_days: -186, duration_nights: 14, total_value: 5400, source: 'phone' },
      { reference: 'TG-2026-115', stage: 'quoted', destination: 'Ghana', destination_country: 'GH', depart_offset_days: null, return_offset_days: null, duration_nights: 14, total_value: 5400, source: 'phone' },
    ],
  },

  // 15 — Eleanor Cartwright — senior
  {
    display_name: 'Eleanor Cartwright',
    household_type: 'solo',
    city: 'Wareham',
    postcode: 'BH20 4AA',
    tags: ['Senior'],
    customer_since: '2017-11-15',
    lifetime_value: 21300,
    contacts: [
      { role: 'lead', first_name: 'Eleanor', last_name: 'Cartwright', email: 'e.cartwright@btinternet.com', phone: '+44 7700 901456', date_of_birth: '1948-04-30', marketing_opt_in: true, gdpr_consent: true },
    ],
    trips: [
      { reference: 'TG-2025-180', stage: 'returned', destination: 'Danube River Cruise', destination_country: 'AT', depart_offset_days: -100, return_offset_days: -86, duration_nights: 14, total_value: 4200, source: 'phone' },
      { reference: 'TG-2026-120', stage: 'booked', destination: 'Norwegian Fjords Cruise', destination_country: 'NO', depart_offset_days: 60, return_offset_days: 67, duration_nights: 7, total_value: 3900, source: 'phone' },
    ],
  },

  // 16 — Park family
  {
    display_name: 'Park Family',
    household_type: 'family',
    city: 'Bournemouth',
    postcode: 'BH7 6AA',
    tags: ['Repeat'],
    customer_since: '2021-09-10',
    lifetime_value: 18650,
    contacts: [
      { role: 'lead', first_name: 'Jin', last_name: 'Park', email: 'jin.park@gmail.com', phone: '+44 7700 901567', marketing_opt_in: true, gdpr_consent: true },
      { role: 'partner', first_name: 'Soo', last_name: 'Park', email: 'soo.park@gmail.com', phone: '+44 7700 901568', marketing_opt_in: true, gdpr_consent: true },
      { role: 'child', first_name: 'Jun', last_name: 'Park', date_of_birth: '2014-12-15' },
      { role: 'child', first_name: 'Mina', last_name: 'Park', date_of_birth: '2017-03-08' },
    ],
    trips: [
      { reference: 'TG-2025-195', stage: 'returned', destination: 'Disneyland Paris', destination_country: 'FR', depart_offset_days: -150, return_offset_days: -145, duration_nights: 5, total_value: 2400, source: 'phone' },
      { reference: 'TG-2026-130', stage: 'pre_departure', destination: 'Lake Garda, Italy', destination_country: 'IT', depart_offset_days: 5, return_offset_days: 12, duration_nights: 7, total_value: 3400, source: 'phone' },
    ],
  },

  // 17 — Doyle — re-engagement target
  {
    display_name: 'Margaret & Brian Doyle',
    household_type: 'couple',
    city: 'Bournemouth',
    postcode: 'BH5 1AA',
    tags: ['Repeat'],
    customer_since: '2014-05-20',
    lifetime_value: 35200,
    contacts: [
      { role: 'lead', first_name: 'Margaret', last_name: 'Doyle', email: 'margaret.doyle@aol.com', phone: '+44 7700 901678', date_of_birth: '1960-08-15', passport_expiry: '2026-08-30', marketing_opt_in: true, gdpr_consent: true },
      { role: 'partner', first_name: 'Brian', last_name: 'Doyle', email: 'brian.d@aol.com', phone: '+44 7700 901679', date_of_birth: '1958-03-22', passport_expiry: '2026-08-30', marketing_opt_in: true, gdpr_consent: true },
    ],
    trips: [
      { reference: 'TG-2024-090', stage: 'returned', destination: 'Sicily, Italy', destination_country: 'IT', depart_offset_days: -720, return_offset_days: -713, duration_nights: 7, total_value: 4500, source: 'phone' },
    ],
    interactions: [
      { kind: 'email_in', channel: 'email', direction: 'inbound', subject: 'Long time no speak — thinking about somewhere new',
        body: 'Hi Andy, hope all\'s well! Brian and I have been talking about getting away properly this autumn. Last big trip was Sicily in 2024 — we\'d love something a bit more adventurous this time. Any thoughts?',
        ai_priority: 'later', ai_reason: 'Re-engaged after 2 years · £35k LTV · warm but not urgent',
        occurred_offset_hours: -27, is_read: true },
    ],
  },

  // 18 — Stevenson family — Florida
  {
    display_name: 'Stevenson Family',
    household_type: 'family',
    city: 'Christchurch',
    postcode: 'BH23 4AA',
    tags: ['School holiday'],
    customer_since: '2019-04-15',
    lifetime_value: 29800,
    contacts: [
      { role: 'lead', first_name: 'Kate', last_name: 'Stevenson', email: 'kate.stevenson@hotmail.com', phone: '+44 7700 901789', marketing_opt_in: true, gdpr_consent: true },
      { role: 'partner', first_name: 'Mike', last_name: 'Stevenson', email: 'mike.s@hotmail.com', phone: '+44 7700 901790', marketing_opt_in: true, gdpr_consent: true },
      { role: 'child', first_name: 'Charlie', last_name: 'Stevenson', date_of_birth: '2011-07-04' },
      { role: 'child', first_name: 'Lily', last_name: 'Stevenson', date_of_birth: '2013-12-22' },
      { role: 'child', first_name: 'Ben', last_name: 'Stevenson', date_of_birth: '2016-02-19' },
    ],
    trips: [
      { reference: 'TG-2025-040', stage: 'returned', destination: 'Florida, USA', destination_country: 'US', depart_offset_days: -200, return_offset_days: -186, duration_nights: 14, total_value: 12400, source: 'phone' },
      { reference: 'TG-2026-140', stage: 'booked', destination: 'Antalya, Turkey', destination_country: 'TR', depart_offset_days: 76, return_offset_days: 86, duration_nights: 10, total_value: 4200, source: 'phone' },
    ],
  },

  // 19 — Yusuf family — Marrakech
  {
    display_name: 'Yusuf Family',
    household_type: 'family',
    city: 'Southampton',
    postcode: 'SO15 1AA',
    tags: ['Cultural'],
    customer_since: '2022-10-12',
    lifetime_value: 16900,
    contacts: [
      { role: 'lead', first_name: 'Aisha', last_name: 'Yusuf', email: 'aisha.yusuf@gmail.com', phone: '+44 7700 901890', marketing_opt_in: true, gdpr_consent: true },
      { role: 'partner', first_name: 'Hassan', last_name: 'Yusuf', email: 'h.yusuf@gmail.com', phone: '+44 7700 901891', marketing_opt_in: true, gdpr_consent: true },
      { role: 'child', first_name: 'Layla', last_name: 'Yusuf', date_of_birth: '2014-06-10' },
      { role: 'child', first_name: 'Omar', last_name: 'Yusuf', date_of_birth: '2017-09-28' },
    ],
    trips: [
      { reference: 'TG-2025-300', stage: 'returned', destination: 'Marrakech, Morocco', destination_country: 'MA', depart_offset_days: -300, return_offset_days: -293, duration_nights: 7, total_value: 3900, source: 'phone' },
    ],
  },

  // 20 — Penelope Wright — new lead solo
  {
    display_name: 'Penelope Wright',
    household_type: 'solo',
    city: 'Wimborne',
    postcode: 'BH21 7AA',
    tags: ['New'],
    customer_since: '2026-05-08',
    lifetime_value: 0,
    contacts: [
      { role: 'lead', first_name: 'Penelope', last_name: 'Wright', email: 'penny.wright@btinternet.com', phone: '+44 7700 901901', date_of_birth: '1968-04-12', marketing_opt_in: true, gdpr_consent: true },
    ],
    trips: [
      { reference: 'TG-2026-150', stage: 'enquiry', destination: 'Lake Garda, Italy', destination_country: 'IT', depart_offset_days: null, return_offset_days: null, total_value: 2200, source: 'widget_enquiry' },
    ],
    interactions: [
      { kind: 'enquiry', channel: 'web_form', direction: 'inbound', subject: 'Italian lakes for late September',
        body: 'Hi there, looking for a relaxed trip to Italy. Lake Como or Lake Garda. I\'m travelling solo but looking for somewhere safe and lovely.',
        ai_priority: 'later', ai_reason: 'New lead · solo · low urgency · September departure',
        occurred_offset_hours: -14, is_read: true },
    ],
  },

  // 21 — The Davies — Croatia
  {
    display_name: 'The Davies',
    household_type: 'couple',
    city: 'Salisbury',
    postcode: 'SP2 8AA',
    tags: ['Repeat'],
    customer_since: '2020-09-30',
    lifetime_value: 23700,
    contacts: [
      { role: 'lead', first_name: 'Huw', last_name: 'Davies', email: 'huw.davies@yahoo.co.uk', phone: '+44 7700 902012', marketing_opt_in: true, gdpr_consent: true },
      { role: 'partner', first_name: 'Bethan', last_name: 'Davies', email: 'b.davies@yahoo.co.uk', phone: '+44 7700 902013', marketing_opt_in: true, gdpr_consent: true },
    ],
    trips: [
      { reference: 'TG-2025-220', stage: 'returned', destination: 'Algarve, Portugal', destination_country: 'PT', depart_offset_days: -190, return_offset_days: -183, duration_nights: 7, total_value: 3400, source: 'phone' },
      { reference: 'TG-2026-160', stage: 'travelling', destination: 'Dubrovnik, Croatia', destination_country: 'HR', depart_offset_days: -1, return_offset_days: 6, duration_nights: 7, total_value: 3800, source: 'phone' },
    ],
  },

  // 22 — Ahmed Bashir — solo, Jordan
  {
    display_name: 'Ahmed Bashir',
    household_type: 'solo',
    city: 'Bournemouth',
    postcode: 'BH8 9AA',
    tags: ['New'],
    customer_since: '2024-04-20',
    lifetime_value: 12500,
    contacts: [
      { role: 'lead', first_name: 'Ahmed', last_name: 'Bashir', email: 'a.bashir@gmail.com', phone: '+44 7700 902123', marketing_opt_in: true, gdpr_consent: true },
    ],
    trips: [
      { reference: 'TG-2025-230', stage: 'returned', destination: 'Istanbul, Turkey', destination_country: 'TR', depart_offset_days: -160, return_offset_days: -153, duration_nights: 7, total_value: 1900, source: 'website' },
      { reference: 'TG-2026-170', stage: 'quoted', destination: 'Jordan & Petra', destination_country: 'JO', depart_offset_days: null, return_offset_days: null, duration_nights: 9, total_value: 2890, source: 'website' },
    ],
  },

  // 23 — Whitfield family — multi-gen
  {
    display_name: 'Whitfield Family',
    household_type: 'family',
    city: 'New Forest',
    postcode: 'SO42 7AA',
    tags: ['Multi-gen', 'High value'],
    customer_since: '2016-02-10',
    lifetime_value: 51200,
    contacts: [
      { role: 'lead', first_name: 'Mark', last_name: 'Whitfield', email: 'mark.whitfield@hotmail.com', phone: '+44 7700 902234', marketing_opt_in: true, gdpr_consent: true },
      { role: 'partner', first_name: 'Emma', last_name: 'Whitfield', email: 'emma.w@hotmail.com', phone: '+44 7700 902235', marketing_opt_in: true, gdpr_consent: true },
      { role: 'child', first_name: 'Hugo', last_name: 'Whitfield', date_of_birth: '2010-05-30' },
      { role: 'child', first_name: 'Florence', last_name: 'Whitfield', date_of_birth: '2013-11-17' },
      { role: 'dependant', first_name: 'Patricia', last_name: 'Whitfield', date_of_birth: '1950-07-08' },
      { role: 'dependant', first_name: 'Richard', last_name: 'Whitfield', date_of_birth: '1949-11-12' },
    ],
    trips: [
      { reference: 'TG-2025-150', stage: 'returned', destination: 'Jersey', destination_country: 'JE', depart_offset_days: -90, return_offset_days: -83, duration_nights: 7, total_value: 4800, source: 'phone' },
      { reference: 'TG-2026-180', stage: 'booked', destination: 'Costa Brava, Spain', destination_country: 'ES', depart_offset_days: 120, return_offset_days: 134, duration_nights: 14, total_value: 8100, source: 'phone' },
    ],
  },

  // 24 — Christine Parker — solo, Sorrento
  {
    display_name: 'Christine Parker',
    household_type: 'solo',
    city: 'Poole',
    postcode: 'BH14 0AA',
    tags: ['New'],
    customer_since: '2024-03-15',
    lifetime_value: 7800,
    contacts: [
      { role: 'lead', first_name: 'Christine', last_name: 'Parker', email: 'c.parker@aol.co.uk', phone: '+44 7700 902345', marketing_opt_in: true, gdpr_consent: true },
    ],
    trips: [
      { reference: 'TG-2024-310', stage: 'returned', destination: 'Sorrento, Italy', destination_country: 'IT', depart_offset_days: -400, return_offset_days: -393, duration_nights: 7, total_value: 2100, source: 'website' },
    ],
  },

  // 25 — Reilly-Murphy — couple, foodie
  {
    display_name: 'Reilly-Murphy',
    household_type: 'couple',
    city: 'Bournemouth',
    postcode: 'BH3 7AA',
    tags: ['Foodie'],
    customer_since: '2022-04-30',
    lifetime_value: 14250,
    contacts: [
      { role: 'lead', first_name: 'Sean', last_name: 'Reilly-Murphy', email: 'sean.reilly@gmail.com', phone: '+44 7700 902456', marketing_opt_in: true, gdpr_consent: true },
      { role: 'partner', first_name: 'Aoife', last_name: 'Reilly-Murphy', email: 'aoife.r@gmail.com', phone: '+44 7700 902457', marketing_opt_in: true, gdpr_consent: true },
    ],
    trips: [
      { reference: 'TG-2025-260', stage: 'returned', destination: 'Tuscany, Italy', destination_country: 'IT', depart_offset_days: -210, return_offset_days: -203, duration_nights: 7, total_value: 4100, source: 'phone' },
      { reference: 'TG-2026-190', stage: 'pre_departure', destination: 'San Sebastián, Spain', destination_country: 'ES', depart_offset_days: 11, return_offset_days: 18, duration_nights: 7, total_value: 2200, source: 'phone' },
    ],
  },

  // 26 — Booth family
  {
    display_name: 'Booth Family',
    household_type: 'family',
    city: 'Christchurch',
    postcode: 'BH23 6AA',
    tags: ['School holiday'],
    customer_since: '2021-07-15',
    lifetime_value: 20300,
    contacts: [
      { role: 'lead', first_name: 'Jess', last_name: 'Booth', email: 'jess.booth@yahoo.com', phone: '+44 7700 902567', marketing_opt_in: true, gdpr_consent: true },
      { role: 'partner', first_name: 'Daniel', last_name: 'Booth', email: 'd.booth@yahoo.com', phone: '+44 7700 902568', marketing_opt_in: true, gdpr_consent: true },
      { role: 'child', first_name: 'Toby', last_name: 'Booth', date_of_birth: '2013-04-04' },
      { role: 'child', first_name: 'Maisie', last_name: 'Booth', date_of_birth: '2015-08-19' },
    ],
    trips: [
      { reference: 'TG-2024-280', stage: 'returned', destination: 'Costa del Sol, Spain', destination_country: 'ES', depart_offset_days: -340, return_offset_days: -333, duration_nights: 7, total_value: 3200, source: 'phone' },
      { reference: 'TG-2026-200', stage: 'enquiry', destination: 'Costa Brava, Spain', destination_country: 'ES', depart_offset_days: null, return_offset_days: null, total_value: 4200, source: 'phone' },
    ],
  },

  // 27 — Hossain couple, anniversary Vietnam
  {
    display_name: 'Mr & Mrs Hossain',
    household_type: 'couple',
    city: 'Southampton',
    postcode: 'SO16 4AA',
    tags: ['Anniversary'],
    customer_since: '2020-11-20',
    lifetime_value: 17400,
    contacts: [
      { role: 'lead', first_name: 'Mahmud', last_name: 'Hossain', email: 'm.hossain@gmail.com', phone: '+44 7700 902678', marketing_opt_in: true, gdpr_consent: true },
      { role: 'partner', first_name: 'Salma', last_name: 'Hossain', email: 'salma.h@gmail.com', phone: '+44 7700 902679', marketing_opt_in: true, gdpr_consent: true },
    ],
    trips: [
      { reference: 'TG-2025-310', stage: 'returned', destination: 'Paris, France', destination_country: 'FR', depart_offset_days: -100, return_offset_days: -95, duration_nights: 5, total_value: 2300, source: 'phone' },
      { reference: 'TG-2026-210', stage: 'booked', destination: 'Vietnam', destination_country: 'VN', depart_offset_days: 95, return_offset_days: 109, duration_nights: 14, total_value: 5600, occasion: 'anniversary', source: 'phone' },
    ],
  },

  // 28 — Geoffrey Holloway — VIP, Japan
  {
    display_name: 'Geoffrey Holloway',
    household_type: 'solo',
    city: 'Wareham',
    postcode: 'BH20 6AA',
    tags: ['VIP'],
    customer_since: '2016-06-04',
    lifetime_value: 28900,
    contacts: [
      { role: 'lead', first_name: 'Geoffrey', last_name: 'Holloway', email: 'geoff.holloway@btopenworld.com', phone: '+44 7700 902789', date_of_birth: '1955-09-11', passport_expiry: '2026-08-23', marketing_opt_in: true, gdpr_consent: true },
    ],
    trips: [
      { reference: 'TG-2025-090', stage: 'returned', destination: 'Antarctica', destination_country: 'AQ', depart_offset_days: -120, return_offset_days: -106, duration_nights: 14, total_value: 14500, source: 'phone' },
      { reference: 'TG-2026-220', stage: 'travelling', destination: 'Japan', destination_country: 'JP', depart_offset_days: -4, return_offset_days: 10, duration_nights: 14, total_value: 11800, source: 'phone' },
    ],
  },

  // 29 — The Smiths
  {
    display_name: 'The Smiths',
    household_type: 'family',
    city: 'Bournemouth',
    postcode: 'BH10 4AA',
    tags: ['Repeat'],
    customer_since: '2018-08-22',
    lifetime_value: 32600,
    contacts: [
      { role: 'lead', first_name: 'Anna', last_name: 'Smith', email: 'a.smith@hotmail.co.uk', phone: '+44 7700 902890', marketing_opt_in: true, gdpr_consent: true },
      { role: 'partner', first_name: 'Paul', last_name: 'Smith', email: 'p.smith@hotmail.co.uk', phone: '+44 7700 902891', marketing_opt_in: true, gdpr_consent: true },
      { role: 'child', first_name: 'Isla', last_name: 'Smith', date_of_birth: '2010-02-25' },
      { role: 'child', first_name: 'Ethan', last_name: 'Smith', date_of_birth: '2013-06-11' },
      { role: 'child', first_name: 'Freya', last_name: 'Smith', date_of_birth: '2016-10-29' },
    ],
    trips: [
      { reference: 'TG-2025-275', stage: 'returned', destination: 'Lake District', destination_country: 'GB', depart_offset_days: -270, return_offset_days: -263, duration_nights: 7, total_value: 1900, source: 'phone' },
      { reference: 'TG-2026-230', stage: 'pre_departure', destination: 'Cape Verde', destination_country: 'CV', depart_offset_days: 8, return_offset_days: 18, duration_nights: 10, total_value: 4800, source: 'phone' },
    ],
  },

  // 30 — Imogen Castle — wellness retreat
  {
    display_name: 'Imogen Castle',
    household_type: 'solo',
    city: 'Lymington',
    postcode: 'SO41 8AA',
    tags: ['Wellness'],
    customer_since: '2023-02-14',
    lifetime_value: 13800,
    contacts: [
      { role: 'lead', first_name: 'Imogen', last_name: 'Castle', email: 'imogen.castle@gmail.com', phone: '+44 7700 902901', marketing_opt_in: true, gdpr_consent: true },
    ],
    trips: [
      { reference: 'TG-2025-340', stage: 'returned', destination: 'Bali Wellness Retreat', destination_country: 'ID', depart_offset_days: -280, return_offset_days: -270, duration_nights: 10, total_value: 3400, occasion: 'wellness retreat', source: 'phone' },
    ],
  },
];

// ─── Helpers ────────────────────────────────────────────────────────────
export function dateOffsetDays(days: number, fromDate?: Date): string {
  const base = fromDate ? new Date(fromDate.getTime()) : new Date();
  base.setDate(base.getDate() + days);
  return base.toISOString().slice(0, 10);
}

export function dateOffsetHours(hours: number, fromDate?: Date): string {
  const base = fromDate ? new Date(fromDate.getTime()) : new Date();
  base.setTime(base.getTime() + hours * 3600 * 1000);
  return base.toISOString();
}
