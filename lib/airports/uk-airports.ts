/**
 * UK & Ireland commercial airports, for "what can this customer fly from?".
 *
 * A small, curated static list — name, IATA code, coordinates, and whether it's
 * a major hub (long-haul / lots of choice) versus a regional airport (handy,
 * mostly short-haul). Enough to tell an agent, from a customer's postcode, which
 * departure airports are realistically on the table. Straight-line distance is
 * all we need for that judgement, so no external routing is involved.
 *
 * Closed airports (e.g. Doncaster Sheffield) are deliberately omitted — never
 * suggest a departure point that no longer flies.
 */

export type Airport = {
  name: string;
  iata: string;
  lat: number;
  lng: number;
  /** True for the big hubs — long-haul reach and lots of choice. */
  major: boolean;
};

export const UK_AIRPORTS: Airport[] = [
  // ─── London & South East ───────────────────────────────────────────
  { name: "London Heathrow", iata: "LHR", lat: 51.47, lng: -0.4543, major: true },
  { name: "London Gatwick", iata: "LGW", lat: 51.1537, lng: -0.1821, major: true },
  { name: "London Stansted", iata: "STN", lat: 51.885, lng: 0.235, major: true },
  { name: "London Luton", iata: "LTN", lat: 51.8747, lng: -0.3683, major: false },
  { name: "London City", iata: "LCY", lat: 51.5053, lng: 0.0553, major: false },
  { name: "London Southend", iata: "SEN", lat: 51.5714, lng: 0.6956, major: false },
  // ─── South & South West ────────────────────────────────────────────
  { name: "Bournemouth", iata: "BOH", lat: 50.78, lng: -1.8425, major: false },
  { name: "Southampton", iata: "SOU", lat: 50.9503, lng: -1.3568, major: false },
  { name: "Bristol", iata: "BRS", lat: 51.3827, lng: -2.7191, major: false },
  { name: "Exeter", iata: "EXT", lat: 50.7344, lng: -3.4139, major: false },
  { name: "Newquay (Cornwall)", iata: "NQY", lat: 50.4406, lng: -4.9954, major: false },
  { name: "Cardiff", iata: "CWL", lat: 51.3967, lng: -3.3433, major: false },
  // ─── Midlands & East ───────────────────────────────────────────────
  { name: "Birmingham", iata: "BHX", lat: 52.4539, lng: -1.748, major: true },
  { name: "East Midlands", iata: "EMA", lat: 52.8311, lng: -1.3281, major: false },
  { name: "Norwich", iata: "NWI", lat: 52.6758, lng: 1.2828, major: false },
  // ─── North ─────────────────────────────────────────────────────────
  { name: "Manchester", iata: "MAN", lat: 53.365, lng: -2.2727, major: true },
  { name: "Liverpool", iata: "LPL", lat: 53.3336, lng: -2.8497, major: false },
  { name: "Leeds Bradford", iata: "LBA", lat: 53.8659, lng: -1.6606, major: false },
  { name: "Newcastle", iata: "NCL", lat: 55.0375, lng: -1.6917, major: false },
  { name: "Teesside", iata: "MME", lat: 54.5092, lng: -1.4294, major: false },
  { name: "Humberside", iata: "HUY", lat: 53.5744, lng: -0.3508, major: false },
  // ─── Scotland ──────────────────────────────────────────────────────
  { name: "Edinburgh", iata: "EDI", lat: 55.95, lng: -3.3725, major: true },
  { name: "Glasgow", iata: "GLA", lat: 55.8719, lng: -4.4331, major: true },
  { name: "Glasgow Prestwick", iata: "PIK", lat: 55.5094, lng: -4.5867, major: false },
  { name: "Aberdeen", iata: "ABZ", lat: 57.2019, lng: -2.1978, major: false },
  { name: "Inverness", iata: "INV", lat: 57.5425, lng: -4.0475, major: false },
  // ─── Northern Ireland & islands ────────────────────────────────────
  { name: "Belfast International", iata: "BFS", lat: 54.6575, lng: -6.2158, major: false },
  { name: "Belfast City", iata: "BHD", lat: 54.6181, lng: -5.8725, major: false },
  { name: "City of Derry", iata: "LDY", lat: 55.0428, lng: -7.1611, major: false },
  { name: "Isle of Man", iata: "IOM", lat: 54.0833, lng: -4.6239, major: false },
  { name: "Jersey", iata: "JER", lat: 49.2079, lng: -2.1955, major: false },
  { name: "Guernsey", iata: "GCI", lat: 49.435, lng: -2.602, major: false },
  // ─── Republic of Ireland (useful near the border / for choice) ─────
  { name: "Dublin", iata: "DUB", lat: 53.4213, lng: -6.2701, major: true },
  { name: "Cork", iata: "ORK", lat: 51.8413, lng: -8.4911, major: false },
];
