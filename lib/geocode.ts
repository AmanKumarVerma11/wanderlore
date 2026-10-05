// Real place verification via OpenStreetMap Nominatim (free, no API key).
// Every place the model names is looked up here; only ones OSM confirms get a
// map pin. This is our grounding layer — it keeps hallucinated places off the map.
//
// Lookups are bounded to the destination: the destination is geocoded first, and
// each place is searched only inside its bounding box (plus a margin) and country.
// Unbounded name-only searches used to "verify" places on other continents (on
// 2026-10-03 Kyoto's Philosopher's Path matched a poetry path in Scotland).
//
// Nominatim's usage policy: at most 1 request/second across the whole app, results
// must be cached, and apps must be able to switch to another server on request.

import { cacheGet, cacheSet } from "./cache";
import { isKvEnabled, kv } from "./kv";
import { startSpan } from "./trace";
import type { GeoStatus } from "./types";

const NOMINATIM = process.env.NOMINATIM_URL || "https://nominatim.openstreetmap.org/search";
const UA = "Wanderlore/1.0 (cultural trip planner; https://github.com/AmanKumarVerma11)";
const PACE_MS = 1100; // ~1 request/second
// Network lookups per itinerary (cache hits are free). One per mapped place, plus
// a few second tries; the plan caps mapped places at 20 (lib/prompts.ts).
const MAX_CALLS = 24;
const MARGIN_KM = 30; // day trips just outside the destination still count
const DAY = 86_400;

export interface GeoResult {
  lat: number;
  lng: number;
  osmUrl: string;
  name?: string; // OSM's name for it (missing on results cached before it was kept)
  nameMatch?: boolean; // one of OSM's names for it has every word that was searched
}

export interface Destination {
  lat: number;
  lng: number;
  bbox: [number, number, number, number]; // south, north, west, east
  countryCode: string | null;
  displayName: string;
}


export interface PlaceLookup {
  status: GeoStatus;
  geo: GeoResult | null;
  matchedName?: string; // set by repair: the name OSM knows it by
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Per-instance pacing, plus a shared 1-second slot when the KV store is
// configured, because the limit applies to all of the app's traffic combined.
// Calls queue on one promise chain, so concurrent requests in the same instance
// (Fluid compute runs several at once) can't both read lastCallAt and fire together.
let lastCallAt = 0;
let queue: Promise<void> = Promise.resolve();
function paced(): Promise<void> {
  const turn = queue.then(async () => {
    const wait = PACE_MS - (Date.now() - lastCallAt);
    if (wait > 0) await sleep(wait);
    lastCallAt = Date.now();
  });
  queue = turn;
  return turn;
}

async function takeSlot(deadline: number): Promise<boolean> {
  await paced();
  if (isKvEnabled()) {
    while (Date.now() < deadline) {
      const got = await kv(["SET", "nominatim:slot", "1", "PX", PACE_MS, "NX"]);
      if (got !== null) break; // "OK", or undefined when the store is unreachable
      await sleep(250);
    }
  }
  return Date.now() < deadline;
}

interface NominatimHit {
  lat: string;
  lon: string;
  osm_type?: string;
  osm_id?: number;
  boundingbox?: string[];
  name?: string;
  namedetails?: Record<string, string>; // every name: alt_name, name:en, old_name...
  display_name?: string;
  address?: { country_code?: string };
}

/** The top hit; null when OSM has no match; undefined when the request failed
 *  (failures are never cached, so an outage can't poison the cache). The request
 *  ends by the deadline: a slow last lookup must not push past it. */
async function search(
  params: Record<string, string>,
  deadline: number
): Promise<NominatimHit | null | undefined> {
  const url = `${NOMINATIM}?${new URLSearchParams({ format: "jsonv2", limit: "1", ...params })}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.min(8000, deadline - Date.now()));
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: controller.signal,
    });
    if (!res.ok) return undefined;
    const data = (await res.json()) as NominatimHit[];
    return data?.[0] ?? null;
  } catch {
    return undefined;
  } finally {
    clearTimeout(timeout);
  }
}

/** Case, accents and punctuation folded away: "Hanavský pavilon" -> "hanavsky pavilon". */
const fold = (s: string) =>
  s.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/**
 * True when one of the names contains every word of the query. Nominatim's
 * search is loose: asked for "Làng hoa Ngọc Hà" (a Hanoi flower village), its top
 * hit was a community centre in the next province that shares one word.
 */
export function nameMatches(query: string, names: string[]): boolean {
  const words = fold(query).split(" ").filter(Boolean);
  return (
    words.length > 0 &&
    names.some((n) => {
      const have = new Set(fold(n).split(" "));
      return words.every((w) => have.has(w));
    })
  );
}

/** `query` is what was searched, so the result says whether OSM calls it that. */
function toGeo(hit: NominatimHit, query?: string): GeoResult | null {
  const lat = Number.parseFloat(hit.lat);
  const lng = Number.parseFloat(hit.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const osmUrl =
    hit.osm_type && hit.osm_id
      ? `https://www.openstreetmap.org/${hit.osm_type}/${hit.osm_id}`
      : `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=16/${lat}/${lng}`;
  const name = (hit.name || hit.display_name?.split(",")[0] || "").trim();
  const geo: GeoResult = name ? { lat, lng, osmUrl, name } : { lat, lng, osmUrl };
  if (query) geo.nameMatch = nameMatches(query, [name, ...Object.values(hit.namedetails ?? {})]);
  return geo;
}

const normalize = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();

/**
 * Geocode the destination itself. Null means OSM has no such place; undefined
 * means the lookup couldn't be made (Nominatim down, or no time left).
 */
export async function geocodeDestination(
  query: string,
  deadline = Date.now() + 10_000
): Promise<Destination | null | undefined> {
  const end = startSpan("destination", query);
  const key = `dest:v1:${normalize(query)}`;
  const cached = await cacheGet<Destination | null>(key);
  if (cached !== undefined) {
    end(cached ? "found" : "not found", { cached: true });
    return cached;
  }
  if (!(await takeSlot(deadline))) {
    end("no time");
    return undefined;
  }

  const hit = await search({ q: query, addressdetails: "1" }, deadline);
  if (hit === undefined) {
    end("failed");
    return undefined;
  }
  const geo = hit && toGeo(hit);
  const box = hit?.boundingbox?.map(Number);
  const dest: Destination | null =
    hit && geo && box?.length === 4 && box.every(Number.isFinite)
      ? {
          lat: geo.lat,
          lng: geo.lng,
          bbox: box as Destination["bbox"],
          countryCode: hit.address?.country_code ?? null,
          displayName: hit.display_name ?? query,
        }
      : null;
  await cacheSet(key, dest, dest ? 30 * DAY : DAY);
  end(dest ? "found" : "not found");
  return dest;
}

/** The destination box grown by MARGIN_KM on every side, as Nominatim's viewbox. */
export function viewbox(dest: Destination): string {
  const [s, n, w, e] = dest.bbox;
  const dLat = MARGIN_KM / 111;
  const dLng = MARGIN_KM / (111 * Math.cos((((s + n) / 2) * Math.PI) / 180));
  const r = (x: number) => x.toFixed(4);
  return [r(w - dLng), r(n + dLat), r(e + dLng), r(s - dLat)].join(",");
}

/**
 * Query shapes for one place, tried in order: the place name as the model wrote
 * it (often the local-language name OSM uses), then the first part of its
 * geoQuery (often the English name). Parenthetical notes are dropped.
 */
export function boundedQueries(place: { name: string; geoQuery: string }): string[] {
  const clean = (s: string) => s.replace(/\(.*?\)/g, "").replace(/\s+/g, " ").trim();
  const shapes = [clean(place.name), clean(place.geoQuery.split(",")[0] ?? "")];
  return Array.from(new Set(shapes.filter((q) => q.length >= 2)));
}

/**
 * Look up every place inside the destination. Breadth-first: each place gets its
 * first query before any place gets a second, so the call budget never leaves a
 * place unchecked while another is retried. Results are in input order.
 * Repair lookups search a name the model says OSM uses, so a hit counts only if
 * one of OSM's names for it matches; they show up in the trace as their own step.
 */
export async function geocodePlaces(
  places: Array<{ name: string; geoQuery: string }>,
  dest: Destination,
  deadline = Date.now() + 30_000,
  { repair = false }: { repair?: boolean } = {}
): Promise<PlaceLookup[]> {
  const span = repair ? "repair-lookup" : "lookup";
  const box = viewbox(dest);
  const bounds: Record<string, string> = { viewbox: box, bounded: "1", namedetails: "1" };
  if (dest.countryCode) bounds.countrycodes = dest.countryCode;
  // Results cached before nameMatch was kept fall back to the main name.
  const accept = (geo: GeoResult, q: string) =>
    !repair || (geo.nameMatch ?? nameMatches(q, [geo.name ?? ""]));
  const outcome = (geo: GeoResult | null, q: string) =>
    !geo ? "not found" : accept(geo, q) ? "found" : "found, other name";

  const results: PlaceLookup[] = places.map(() => ({ status: "unchecked", geo: null }));
  const queries = places.map(boundedQueries);
  const cutoff = deadline - 1500; // leave time for the last request itself
  let calls = 0;

  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < places.length; i++) {
      const q = queries[i][pass];
      if (!q || results[i].status === "verified") continue;
      const key = `geo:v1:${dest.countryCode ?? "-"}:${box}:${normalize(q)}`;
      let geo = await cacheGet<GeoResult | null>(key);
      if (geo !== undefined) {
        startSpan(span, q)(outcome(geo, q), { cached: true });
      } else {
        // Past the cutoff, skip without queueing: each queued turn costs 1.1s.
        if (calls >= MAX_CALLS || Date.now() >= cutoff || !(await takeSlot(cutoff))) continue;
        calls++;
        const end = startSpan(span, q);
        const hit = await search({ q, ...bounds }, deadline);
        if (hit === undefined) {
          end("failed"); // request failed: leave the status as it was
          continue;
        }
        geo = hit ? toGeo(hit, q) : null;
        end(outcome(geo, q));
        await cacheSet(key, geo, geo ? 30 * DAY : 7 * DAY);
      }
      results[i] = geo && accept(geo, q) ? { status: "verified", geo } : { status: "not_found", geo: null };
    }
  }
  return results;
}
