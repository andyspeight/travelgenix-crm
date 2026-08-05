/**
 * Road distances via OpenRouteService's matrix API.
 *
 * One request gives the driving distance and time from a single origin (the
 * customer) to several destinations (their nearest airports). The request/parse
 * shaping is pure so it can be tested without a network; roadDistances() does
 * the actual call and is used by the /api/geo/road-distances route (the ORS key
 * is a secret, so this only ever runs server-side).
 *
 * Note ORS speaks [lng, lat], and a pair with no road route (an island airport
 * across water) comes back null — which is correct: you can't drive there.
 */

export type Point = { lat: number; lng: number };
export type RoadLeg = { miles: number | null; minutes: number | null };

const ORS_MATRIX_URL = "https://api.openrouteservice.org/v2/matrix/driving-car";

/** The ORS matrix request body for one origin → many destinations, in miles. */
export function buildMatrixBody(source: Point, destinations: Point[]) {
  return {
    locations: [
      [source.lng, source.lat],
      ...destinations.map((d) => [d.lng, d.lat]),
    ],
    sources: [0],
    destinations: destinations.map((_, i) => i + 1),
    metrics: ["distance", "duration"],
    units: "mi",
  };
}

/** Turn an ORS matrix response into one leg per destination (miles + minutes). */
export function parseMatrix(json: unknown, count: number): RoadLeg[] {
  const j = json as { distances?: (number | null)[][]; durations?: (number | null)[][] };
  const dist = j?.distances?.[0];
  const dur = j?.durations?.[0];
  return Array.from({ length: count }, (_, i) => {
    const m = dist?.[i];
    const s = dur?.[i];
    return {
      miles: typeof m === "number" ? Math.round(m) : null,
      minutes: typeof s === "number" ? Math.round(s / 60) : null,
    };
  });
}

/**
 * Driving distance/time from the source to each destination. Returns one leg
 * per destination (nulls where there's no drivable route). Throws on a bad
 * key or an ORS error so the caller can decide how to degrade.
 */
export async function roadDistances(
  apiKey: string,
  source: Point,
  destinations: Point[]
): Promise<RoadLeg[]> {
  if (destinations.length === 0) return [];
  const res = await fetch(ORS_MATRIX_URL, {
    method: "POST",
    headers: { authorization: apiKey, "content-type": "application/json" },
    body: JSON.stringify(buildMatrixBody(source, destinations)),
    signal: AbortSignal.timeout(6000),
  });
  if (!res.ok) throw new Error(`OpenRouteService ${res.status}`);
  return parseMatrix(await res.json(), destinations.length);
}
