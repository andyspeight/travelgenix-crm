/**
 * Nearest airports to a point — pure geometry, no I/O.
 *
 * Straight-line ("as the crow flies") distance is the right measure here: an
 * agent wants to know which airports are realistically near a customer, not a
 * routed drive time. We label it as approximate in the UI so nobody reads a
 * road distance into it.
 */

import { UK_AIRPORTS, type Airport } from "./uk-airports";

export type NearbyAirport = Airport & { miles: number };

const EARTH_RADIUS_MILES = 3958.8;

const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle distance between two lat/lng points, in miles. */
export function haversineMiles(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * The `count` airports closest to a point, nearest first, each with its
 * straight-line distance in whole miles.
 */
export function nearestAirports(
  point: { lat: number; lng: number },
  count = 4,
  airports: Airport[] = UK_AIRPORTS
): NearbyAirport[] {
  return airports
    .map((a) => ({ ...a, miles: Math.round(haversineMiles(point, a)) }))
    .sort((x, y) => x.miles - y.miles)
    .slice(0, Math.max(0, count));
}
