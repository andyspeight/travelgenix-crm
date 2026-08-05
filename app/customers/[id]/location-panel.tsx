"use client";

/**
 * Location & airports — a 360 panel that turns a customer's address into travel
 * context: a map of where they are, and the airports they can realistically fly
 * from, nearest first. It's here so an agent can make a sensible suggestion in
 * the moment ("Bournemouth's on your doorstep, but Heathrow opens up long-haul").
 *
 * No API key and no server work: the map is a keyless Google Maps embed keyed on
 * the postcode, and the airports come from geocoding the postcode with the free,
 * CORS-friendly postcodes.io (UK) in the browser, then measuring straight-line
 * distance to a bundled airport list. If geocoding fails (a non-UK or unknown
 * postcode), the map still shows and the airport list bows out quietly.
 */

import { useEffect, useState } from "react";
import { PlaneIcon } from "@/components/ui/icons";
import { nearestAirports, type NearbyAirport } from "@/lib/airports/nearest";

type Status = "loading" | "ready" | "unavailable";

export function LocationPanel({ postcode, address }: { postcode: string; address: string }) {
  const [airports, setAirports] = useState<NearbyAirport[]>([]);
  const [status, setStatus] = useState<Status>("loading");

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
          status?: number;
          result?: { latitude?: number; longitude?: number } | null;
        };
        const lat = body.result?.latitude;
        const lng = body.result?.longitude;
        if (cancelled) return;
        if (typeof lat === "number" && typeof lng === "number") {
          setAirports(nearestAirports({ lat, lng }, 4));
          setStatus("ready");
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

  const mapQuery = encodeURIComponent(address || postcode);
  const mapSrc = `https://maps.google.com/maps?q=${mapQuery}&z=11&hl=en&output=embed`;
  const mapLink = `https://www.google.com/maps/search/?api=1&query=${mapQuery}`;

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
      <div style={{ position: "relative", height: 170, background: "var(--bg-subtle)" }}>
        <iframe
          title={`Map of ${address || postcode}`}
          src={mapSrc}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          style={{ border: 0, width: "100%", height: "100%", display: "block" }}
        />
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
            Couldn't place this postcode, so no airport distances. The map above still shows the address.
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
                  <span style={{ flexShrink: 0, fontSize: 12.5, color: "var(--text-muted)", fontWeight: 500 }}>
                    ~{a.miles} mi
                  </span>
                </li>
              ))}
            </ul>
            <div style={{ marginTop: 10, fontSize: 11, color: "var(--text-subtle)", lineHeight: 1.5 }}>
              Straight-line distances. “Hub” means long-haul reach and more choice — handy when suggesting where to fly from.
            </div>
          </>
        )}
      </div>
    </div>
  );
}
