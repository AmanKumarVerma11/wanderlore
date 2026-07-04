// Real place verification via OpenStreetMap Nominatim (free, no API key).
// Every place the model names is looked up here; only ones OSM confirms get a
// map pin. This is our grounding layer — it keeps hallucinated places off the map.
//
// Nominatim's usage policy asks for at most ~1 request/second and no heavy
// concurrency, so we geocode sequentially with a small delay. A hit rate this
// buys is far higher than firing requests in parallel (which gets throttled).

const NOMINATIM = "https://nominatim.openstreetmap.org/search";
const UA = "Wanderlore/1.0 (cultural trip planner; https://github.com/AmanKumarVerma11)";
const PACE_MS = 1100; // stay under 1 req/sec
const MAX_LOOKUPS = 20; // bound worst-case latency for long trips

export interface GeoResult {
  lat: number;
  lng: number;
  osmUrl: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Simplify a compound query ("A and B (note), City") to its first real place. */
export function simplifyQuery(query: string): string {
  const parts = query.split(",");
  let name = parts[0].replace(/\(.*?\)/g, "").trim();
  name = name.split(/\s+(?:and|&)\s+|\//i)[0].trim();
  const rest = parts.slice(1).join(",").trim();
  return rest ? `${name}, ${rest}` : name;
}

async function fetchGeo(query: string): Promise<GeoResult | null> {
  const url = `${NOMINATIM}?format=jsonv2&limit=1&q=${encodeURIComponent(query)}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Array<{
      lat: string;
      lon: string;
      osm_type?: string;
      osm_id?: number;
    }>;
    const hit = data?.[0];
    if (!hit) return null;
    const lat = Number.parseFloat(hit.lat);
    const lng = Number.parseFloat(hit.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    const osmUrl =
      hit.osm_type && hit.osm_id
        ? `https://www.openstreetmap.org/${hit.osm_type}/${hit.osm_id}`
        : `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=16/${lat}/${lng}`;
    return { lat, lng, osmUrl };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/** Look up one query, falling back to a simplified form for compound names. */
export async function geocodeOne(query: string): Promise<GeoResult | null> {
  const hit = await fetchGeo(query);
  if (hit) return hit;
  const simple = simplifyQuery(query);
  if (simple !== query) {
    await sleep(PACE_MS);
    return fetchGeo(simple);
  }
  return null;
}

/**
 * Geocode many queries sequentially (respecting Nominatim's rate limit), deduping
 * identical queries. Order of results matches input order; a null means
 * "unverified" rather than a hard failure. Lookups are capped to bound latency.
 */
export async function geocodeMany(
  queries: string[]
): Promise<Array<GeoResult | null>> {
  const cache = new Map<string, GeoResult | null>();
  const results: Array<GeoResult | null> = new Array(queries.length).fill(null);
  let lookups = 0;
  let first = true;

  for (let i = 0; i < queries.length; i++) {
    const q = queries[i];
    if (cache.has(q)) {
      results[i] = cache.get(q) ?? null;
      continue;
    }
    if (lookups >= MAX_LOOKUPS) break;
    if (!first) await sleep(PACE_MS);
    first = false;
    const r = await geocodeOne(q);
    lookups++;
    cache.set(q, r);
    results[i] = r;
  }
  return results;
}
