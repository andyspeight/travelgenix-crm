"use client";

/**
 * "For the call" — a couple of warm, human openers so an agent has something to
 * lead with: how their last trip went, and their next trip with its live
 * weather ("it's 27°C in the Algarve right now — perfect timing").
 *
 * The trip facts are computed server-side and passed in; the destination's
 * current weather is fetched here (Open-Meteo geocoding → forecast, both free
 * and keyless). If the destination can't be placed or the weather can't be
 * fetched, the line still shows the trip, just without the temperature. The
 * whole panel renders nothing when there's neither a last nor a next trip.
 */

import { useEffect, useState } from "react";
import { geocodePlace, currentWeather, type WeatherNow } from "@/lib/weather/open-meteo";

type LastTrip = { destination: string; phrase: string };
type NextTrip = { destination: string; active: boolean; phrase: string | null };

export function CallOpenersPanel({ lastTrip, nextTrip }: { lastTrip: LastTrip | null; nextTrip: NextTrip | null }) {
  const [destWeather, setDestWeather] = useState<WeatherNow | null>(null);

  useEffect(() => {
    let cancelled = false;
    setDestWeather(null);
    const dest = nextTrip?.destination;
    if (!dest) return;
    (async () => {
      const place = await geocodePlace(dest);
      if (cancelled || !place) return;
      const w = await currentWeather(place.lat, place.lng);
      if (!cancelled) setDestWeather(w);
    })();
    return () => {
      cancelled = true;
    };
  }, [nextTrip?.destination]);

  if (!lastTrip && !nextTrip) return null;

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, marginBottom: 16, overflow: "hidden" }}>
      <div style={{ padding: "11px 16px", borderBottom: "1px solid var(--border)", fontSize: 12, fontWeight: 700, letterSpacing: "-0.01em" }}>
        For the call
      </div>
      <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
        {lastTrip && (
          <Opener emoji="🧳">
            Back from <strong style={{ fontWeight: 600 }}>{lastTrip.destination}</strong>, {lastTrip.phrase}.
          </Opener>
        )}

        {nextTrip && (
          <Opener emoji={destWeather ? destWeather.emoji : nextTrip.active ? "🌍" : "✈️"}>
            {destWeather ? (
              <>
                It&apos;s <strong style={{ fontWeight: 600 }}>{destWeather.tempC}°C</strong> in{" "}
                <strong style={{ fontWeight: 600 }}>{nextTrip.destination}</strong> right now
              </>
            ) : (
              <>
                {nextTrip.active ? "In " : "Off to "}
                <strong style={{ fontWeight: 600 }}>{nextTrip.destination}</strong>
              </>
            )}
            {nextTrip.phrase ? ` · ${nextTrip.phrase}` : ""}
          </Opener>
        )}
      </div>
    </div>
  );
}

function Opener({ emoji, children }: { emoji: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 13, color: "var(--text)", lineHeight: 1.5 }}>
      <span style={{ fontSize: 16, flexShrink: 0, lineHeight: 1.3 }} aria-hidden>
        {emoji}
      </span>
      <span style={{ color: "var(--text-muted)" }}>{children}</span>
    </div>
  );
}
