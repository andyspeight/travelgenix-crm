/**
 * Current weather for a point, via Open-Meteo.
 *
 * Free, keyless and CORS-friendly, so the browser calls it directly (like
 * postcodes.io) — no server route, no signup. Powers the "what's it like there
 * right now" ice-breaker on the customer 360.
 *
 * Open-Meteo returns a WMO weather code; describeWeather() turns that into a
 * plain label and an emoji. The mapping is pure and tested; currentWeather()
 * does the fetch and returns null on any trouble so the panel just omits it.
 */

export type WeatherNow = { tempC: number; code: number; label: string; emoji: string };

// WMO weather-interpretation codes → a human label + emoji.
const WMO: Record<number, { label: string; emoji: string }> = {
  0: { label: "Clear", emoji: "☀️" },
  1: { label: "Mainly clear", emoji: "🌤️" },
  2: { label: "Partly cloudy", emoji: "⛅" },
  3: { label: "Overcast", emoji: "☁️" },
  45: { label: "Fog", emoji: "🌫️" },
  48: { label: "Freezing fog", emoji: "🌫️" },
  51: { label: "Light drizzle", emoji: "🌦️" },
  53: { label: "Drizzle", emoji: "🌦️" },
  55: { label: "Heavy drizzle", emoji: "🌧️" },
  56: { label: "Freezing drizzle", emoji: "🌧️" },
  57: { label: "Freezing drizzle", emoji: "🌧️" },
  61: { label: "Light rain", emoji: "🌦️" },
  63: { label: "Rain", emoji: "🌧️" },
  65: { label: "Heavy rain", emoji: "🌧️" },
  66: { label: "Freezing rain", emoji: "🌧️" },
  67: { label: "Freezing rain", emoji: "🌧️" },
  71: { label: "Light snow", emoji: "🌨️" },
  73: { label: "Snow", emoji: "🌨️" },
  75: { label: "Heavy snow", emoji: "❄️" },
  77: { label: "Snow grains", emoji: "🌨️" },
  80: { label: "Light showers", emoji: "🌦️" },
  81: { label: "Showers", emoji: "🌦️" },
  82: { label: "Heavy showers", emoji: "🌧️" },
  85: { label: "Snow showers", emoji: "🌨️" },
  86: { label: "Snow showers", emoji: "🌨️" },
  95: { label: "Thunderstorm", emoji: "⛈️" },
  96: { label: "Thunderstorm", emoji: "⛈️" },
  99: { label: "Thunderstorm", emoji: "⛈️" },
};

/** A plain label + emoji for a WMO weather code. */
export function describeWeather(code: number): { label: string; emoji: string } {
  return WMO[code] ?? { label: "—", emoji: "🌡️" };
}

/**
 * Look up a place name → coordinates, via Open-Meteo's free geocoding API.
 * Used to weather-check a trip destination ("Algarve", "Maldives"). Returns
 * null for anything it can't place (a vague "beach holiday"), so the caller
 * just skips the weather.
 */
export async function geocodePlace(name: string): Promise<{ lat: number; lng: number; name: string } | null> {
  const q = name.trim();
  if (!q) return null;
  try {
    const res = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=1&language=en&format=json`,
      { signal: AbortSignal.timeout(6000) }
    );
    if (!res.ok) return null;
    const j = (await res.json()) as { results?: { latitude?: number; longitude?: number; name?: string }[] };
    const r = j.results?.[0];
    if (!r || typeof r.latitude !== "number" || typeof r.longitude !== "number") return null;
    return { lat: r.latitude, lng: r.longitude, name: r.name ?? q };
  } catch {
    return null;
  }
}

/** Current temperature + conditions at a point, or null on any failure. */
export async function currentWeather(lat: number, lng: number): Promise<WeatherNow | null> {
  try {
    const res = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
        `&current=temperature_2m,weather_code&timezone=auto`,
      { signal: AbortSignal.timeout(6000) }
    );
    if (!res.ok) return null;
    const j = (await res.json()) as { current?: { temperature_2m?: number; weather_code?: number } };
    const t = j.current?.temperature_2m;
    const code = j.current?.weather_code;
    if (typeof t !== "number" || typeof code !== "number") return null;
    const d = describeWeather(code);
    return { tempC: Math.round(t), code, label: d.label, emoji: d.emoji };
  } catch {
    return null;
  }
}
