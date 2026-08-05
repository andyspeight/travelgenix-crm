"use client";

/**
 * Location & airports — a 360 panel that turns a customer's address into travel
 * context: a map of where they are, and the airports they can realistically fly
 * from, nearest first. It's here so an agent can make a sensible suggestion in
 * the moment ("Bournemouth's on your doorstep, but Heathrow opens up long-haul").
 *
 * MAP PROVIDER: MapTiler — the same provider (and same publishable key) the
 * Travelgenix widgets use for the offers world map. The widgets keep that key
 * inline in the client JS; here we read it from NEXT_PUBLIC_MAPTILER_KEY instead,
 * so it isn't committed to this (public) repo. That's the only setup: set the
 * env var to the shared Travelgenix key and redeploy. No per-domain step — the
 * key already serves the offers map on clients' own websites (arbitrary
 * domains), so it isn't origin-restricted. If the key is unset, the airports
 * still work and the map area shows an "Open in Maps" link.
 *
 * We use MapTiler's static-map image (an <img>, no Leaflet or CDN script needed)
 * centred on the geocoded point, with our own pin overlaid at the centre so a
 * marker always shows.
 *
 * GEOCODING: postcodes.io (free, CORS-friendly, UK) turns the postcode into a
 * lat/long in the browser — one call that feeds both the map and the airports.
 * A postcode that can't be placed (non-UK or unknown) drops the map and the
 * list quietly rather than erroring.
 */

import { useEffect, useState } from "react";
import { PlaneIcon } from "@/components/ui/icons";
import { nearestAirports, type NearbyAirport } from "@/lib/airports/nearest";

type Status = "loading" | "ready" | "unavailable";

const MAPTILER_KEY = process.env.NEXT_PUBLIC_MAPTILER_KEY;

/** The small "by road" line under each airport's straight-line distance. */
function roadLabel(
  state: "idle" | "loading" | "ready" | "off",
  leg: { miles: number | null; minutes: number | null } | undefined
): string {
  if (state === "loading") return "…";
  if (state !== "ready" || !leg) return "";
  if (leg.miles == null) return "no road route";
  return `${leg.miles} mi · ${leg.minutes} min`;
}

export function LocationPanel({ postcode, address }: { postcode: string; address: string }) {
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [airports, setAirports] = useState<NearbyAirport[]>([]);
  const [status, setStatus] = useState<Status>("loading");
  const [roads, setRoads] = useState<Record<string, { miles: number | null; minutes: number | null }>>({});
  const [roadState, setRoadState] = useState<"idle" | "loading" | "ready" | "off">("idle");

  useEffect(() => {
    let cancelled = false;
    const pc = postcode.trim();
    if (!pc) {
      setStatus("unavailable");
      return;
    }
    (async () => {
      try {
        const res = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(pc)}`, {
          signal: AbortSignal.timeout(6000),
        });
        const body = (await res.json()) as {
          result?: { latitude?: number; longitude?: number } | null;
        };
        const lat = body.result?.latitude;
        const lng = body.result?.longitude;
        if (cancelled) return;
        if (typeof lat === "number" && typeof lng === "number") {
          const near = nearestAirports({ lat, lng }, 5);
          setCoords({ lat, lng });
          setAirports(near);
          setStatus("ready");

          // Road distances are additive — fetch them after the list is up, and
          // leave the straight-line figures alone if routing isn't available.
          setRoadState("loading");
          fetch("/api/geo/road-distances", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              source: { lat, lng },
              airports: near.map((a) => ({ iata: a.iata, lat: a.lat, lng: a.lng })),
            }),
          })
            .then((r) => r.json())
            .then((d: { ok?: boolean; legs?: typeof roads }) => {
              if (cancelled) return;
              if (d?.ok && d.legs) {
                setRoads(d.legs);
                setRoadState("ready");
              } else {
                setRoadState("off");
              }
            })
            .catch(() => {
              if (!cancelled) setRoadState("off");
            });
        } else {
          setStatus("unavailable");
        }
      } catch {
        if (!cancelled) setStatus("unavailable");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [postcode]);

  const mapLink = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address || postcode)}`;
  const mapSrc =
    MAPTILER_KEY && coords
      ? `https://api.maptiler.com/maps/streets-v2/static/${coords.lng},${coords.lat},12/600x200@2x.png?key=${MAPTILER_KEY}`
      : null;

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, marginBottom: 16, overflow: "hidden" }}>
      <div
        style={{
          padding: "11px 16px",
          borderBottom: "1px solid var(--border)",
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: "-0.01em",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <span>Location &amp; airports</span>
        <a
          href={mapLink}
          target="_blank"
          rel="noopener noreferrer"
          style={{ fontSize: 11, fontWeight: 500, color: "var(--tg-primary)", textDecoration: "none" }}
        >
          Open in Maps ↗
        </a>
      </div>

      {/* Map */}
      <div
        style={{
          position: "relative",
          height: 170,
          background: "var(--bg-subtle)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {mapSrc ? (
          <>
            <img
              src={mapSrc}
              alt={`Map of ${address || postcode}`}
              loading="lazy"
              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
            />
            {/* Our own pin, dead-centre — the map is centred on the address, so
                this always marks the right spot regardless of tile markers. */}
            <span
              aria-hidden
              style={{
                position: "absolute",
                left: "50%",
                top: "50%",
                transform: "translate(-50%, -100%)",
                pointerEvents: "none",
              }}
            >
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
                <path
                  d="M12 22s7-6.2 7-12A7 7 0 0 0 5 10c0 5.8 7 12 7 12Z"
                  fill="var(--tg-primary)"
                  stroke="white"
                  strokeWidth="1.5"
                />
                <circle cx="12" cy="10" r="2.6" fill="white" />
              </svg>
            </span>
          </>
        ) : (
          <div style={{ textAlign: "center", padding: 16 }}>
            <PlaneIcon width={20} height={20} style={{ color: "var(--text-subtle)", opacity: 0.6 }} />
            <div style={{ marginTop: 6, fontSize: 12, color: "var(--text-subtle)" }}>
              {status === "loading" ? "Loading map…" : "Map unavailable"}
            </div>
            <a
              href={mapLink}
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontSize: 12, fontWeight: 600, color: "var(--tg-primary)", textDecoration: "none" }}
            >
              Open in Maps ↗
            </a>
          </div>
        )}
      </div>

      {/* Nearest airports */}
      <div style={{ padding: 16 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 7,
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            color: "var(--text-subtle)",
            marginBottom: 10,
          }}
        >
          <PlaneIcon width={13} height={13} />
          Nearest airports
        </div>

        {status === "loading" && (
          <div style={{ fontSize: 12.5, color: "var(--text-subtle)" }}>Working out nearby airports…</div>
        )}

        {status === "unavailable" && (
          <div style={{ fontSize: 12.5, color: "var(--text-subtle)", lineHeight: 1.5 }}>
            Couldn't place this postcode, so no airport distances.
          </div>
        )}

        {status === "ready" && (
          <>
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
              {airports.map((a) => (
                <li key={a.iata} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span
                    style={{
                      flexShrink: 0,
                      width: 34,
                      textAlign: "center",
                      fontSize: 11,
                      fontWeight: 700,
                      color: "var(--text-muted)",
                      fontFamily: '"JetBrains Mono", monospace',
                      border: "1px solid var(--border)",
                      borderRadius: 5,
                      padding: "2px 0",
                    }}
                  >
                    {a.iata}
                  </span>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: "var(--text)" }}>
                    {a.name}
                    {a.major && (
                      <span
                        style={{
                          marginLeft: 7,
                          fontSize: 10,
                          fontWeight: 600,
                          color: "var(--tg-accent-dark)",
                          background: "var(--bg-subtle)",
                          border: "1px solid var(--border)",
                          borderRadius: 999,
                          padding: "0 6px",
                        }}
                      >
                        hub
                      </span>
                    )}
                  </span>
                  <span style={{ flexShrink: 0, textAlign: "right", lineHeight: 1.35 }}>
                    <span style={{ display: "block", fontSize: 12.5, color: "var(--text-muted)", fontWeight: 500 }}>
                      ~{a.miles} mi
                    </span>
                    <span style={{ display: "block", fontSize: 11, color: "var(--text-subtle)" }}>
                      {roadLabel(roadState, roads[a.iata])}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
            <div style={{ marginTop: 10, fontSize: 11, color: "var(--text-subtle)", lineHeight: 1.5 }}>
              {roadState === "ready"
                ? "Top figure is straight-line; below is by road (via OpenRouteService). "
                : "Straight-line distances. "}
              “Hub” means long-haul reach and more choice — handy when suggesting where to fly from.
            </div>
          </>
        )}
      </div>
    </div>
  );
}
