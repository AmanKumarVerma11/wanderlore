"use client";

import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";
import type { EnrichedPlace } from "@/lib/types";

interface Props {
  places: EnrichedPlace[];
  center: { lat: number; lng: number } | null;
}

/**
 * Renders verified places on an OpenStreetMap map via Leaflet. Leaflet is
 * imported dynamically inside the effect so it never touches `window` during
 * SSR. Markers use a CSS pin (divIcon) so no external icon assets are needed —
 * keeps us within a strict Content-Security-Policy.
 */
export default function TripMap({ places, center }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const pins = places.filter(
      (p) => p.verified && p.lat != null && p.lng != null
    );
    if (!ref.current) return;

    let map: import("leaflet").Map | null = null;

    (async () => {
      const L = (await import("leaflet")).default;
      if (!ref.current) return;

      const start: [number, number] = center
        ? [center.lat, center.lng]
        : pins.length
        ? [pins[0].lat as number, pins[0].lng as number]
        : [20, 0];

      map = L.map(ref.current, { scrollWheelZoom: false }).setView(
        start,
        pins.length ? 13 : 3
      );

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap contributors",
        maxZoom: 19,
      }).addTo(map);

      const bounds: [number, number][] = [];
      pins.forEach((p, i) => {
        const gem = p.type === "gem";
        const color = gem ? "#e5352b" : "#1a1a1a";
        const icon = L.divIcon({
          className: "",
          html: `<div style="position:relative;transform:translate(-50%,-100%)">
              <div style="width:26px;height:26px;border-radius:50% 50% 50% 0;background:${color};transform:rotate(-45deg);box-shadow:0 2px 6px rgba(0,0,0,.35);border:2px solid #fff"></div>
              <div style="position:absolute;top:4px;left:0;width:26px;text-align:center;color:#fff;font:600 12px system-ui">${i + 1}</div>
            </div>`,
          iconSize: [26, 26],
          iconAnchor: [13, 26],
        });
        L.marker([p.lat as number, p.lng as number], { icon })
          .addTo(map as import("leaflet").Map)
          .bindPopup(
            `<strong>${i + 1}. ${escapeHtml(p.name)}</strong><br/><span style="color:#555">${
              gem ? "Hidden gem" : "Attraction"
            }</span>`
          );
        bounds.push([p.lat as number, p.lng as number]);
      });

      if (bounds.length > 1) {
        map.fitBounds(bounds, { padding: [40, 40] });
      }
    })();

    return () => {
      if (map) map.remove();
    };
  }, [places, center]);

  const verifiedCount = places.filter((p) => p.verified).length;
  if (verifiedCount === 0) {
    return (
      <div className="card grid h-64 place-items-center p-6 text-center text-sm text-muted">
        No map locations could be verified for this trip.
      </div>
    );
  }

  return <div ref={ref} className="h-[22rem] w-full" aria-label="Map of recommended places" />;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
