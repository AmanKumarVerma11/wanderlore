// Real place verification via OpenStreetMap Nominatim (free, no API key).
// Every place the model names is looked up here; only ones OSM confirms get a
// map pin. This is our grounding layer — it keeps hallucinated places off the map.
//
// Nominatim's free-text matching is inconsistent: for the same real place, one
// query phrasing resolves while another returns nothing (e.g. "Dashashwamedh Ghat"
// hits but "Dashashwamedh Ghat, Varanasi, India" misses). So we try a few shapes
// per place and take the first hit. All requests are globally throttled to stay
// within Nominatim's ~1 req/sec fair-use policy, and a call budget bounds latency.

const NOMINATIM = "https://nominatim.openstreetmap.org/search";
const UA = "Wanderlore/1.0 (cultural trip planner; https://github.com/AmanKumarVerma11)";
const PACE_MS = 1100; // ~1 request/second
// Hard cap on Nominatim calls per itinerary. Sequential + 1.1s throttle means
// latency is ~MAX_CALLS seconds, so this is the dominant time budget. Kept tight
// enough that the slower ensemble path (panel + synthesis) still finishes well
// under the 60s serverless limit.
const MAX_CALLS = 20;

export interface GeoResult {
  lat: number;
  lng: number;
  osmUrl: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Global throttle shared across all lookups in a request (and reused across
// requests in a warm serverless instance) so we never burst Nominatim.
let lastCallAt = 0;
async function throttle() {
  const now = Date.now();
  const wait = PACE_MS - (now - lastCallAt);
  if (wait > 0) await sleep(wait);
  lastCallAt = Date.now();
}

/**
 * Build a few query shapes for one place, most-specific first, deduped:
 *  1. the model's full "Name, City, Country"
 *  2. "Name, City" (drop country + any middle locality)
 *  3. "Name City" (no punctuation — Nominatim sometimes prefers this)
 *  4. "Name" alone
 */
export function queryVariants(query: string): string[] {
  const parts = query
    .split(",")
    .map((s) => s.replace(/\(.*?\)/g, "").trim())
    .filter(Boolean);
  const name = parts[0] || query.trim();
  const variants = [query.trim()];
  if (parts.length >= 2) {
    // City = last segment that isn't an obvious country-level token.
    const city = parts.length >= 3 ? parts[parts.length - 2] : parts[1];
    variants.push(`${name}, ${city}`);
    variants.push(`${name} ${city}`);
  }
  variants.push(name);
  return Array.from(new Set(variants));
}

async function fetchGeo(query: string): Promise<GeoResult | null> {
  await throttle();
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

/**
 * Geocode many queries, deduped, trying multiple query shapes per place until one
 * resolves. Order of results matches input order; null means "unverified" (shown
 * but flagged) rather than a hard failure. A global call budget bounds latency.
 */
export async function geocodeMany(
  queries: string[]
): Promise<Array<GeoResult | null>> {
  const cache = new Map<string, GeoResult | null>();
  const results: Array<GeoResult | null> = new Array(queries.length).fill(null);
  let calls = 0;

  for (let i = 0; i < queries.length; i++) {
    const q = queries[i];
    if (cache.has(q)) {
      results[i] = cache.get(q) ?? null;
      continue;
    }
    let hit: GeoResult | null = null;
    for (const variant of queryVariants(q)) {
      if (calls >= MAX_CALLS) break;
      calls++;
      hit = await fetchGeo(variant);
      if (hit) break;
    }
    cache.set(q, hit);
    results[i] = hit;
  }
  return results;
}
