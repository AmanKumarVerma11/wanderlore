// Turns the model's raw itinerary into the final, grounded payload: every place
// gets real OSM coordinates where they exist, and the destination + top sites
// get Wikipedia references. Pure helpers are split out so they can be unit-tested.

import type {
  EnrichedPlace,
  Itinerary,
  ModelItinerary,
  Place,
  PlanRequest,
  WikiRef,
} from "./types";
import { geocodeMany, type GeoResult } from "./geocode";
import { wikiMany, wikiSummary } from "./wiki";

/** Pure: merge a place with its (possibly null) geocode result. */
export function toEnrichedPlace(
  place: Place,
  geo: GeoResult | null
): EnrichedPlace {
  return {
    ...place,
    lat: geo?.lat ?? null,
    lng: geo?.lng ?? null,
    verified: geo !== null,
    osmUrl: geo?.osmUrl ?? null,
  };
}

/** Pure: average of all verified coordinates, or null when there are none. */
export function computeCenter(
  places: EnrichedPlace[]
): { lat: number; lng: number } | null {
  const pts = places.filter((p) => p.verified && p.lat != null && p.lng != null);
  if (pts.length === 0) return null;
  const lat = pts.reduce((s, p) => s + (p.lat as number), 0) / pts.length;
  const lng = pts.reduce((s, p) => s + (p.lng as number), 0) / pts.length;
  return { lat, lng };
}

/** Flatten every place across days + localSecrets in a stable order. */
function allPlaces(model: ModelItinerary): Place[] {
  const fromDays = model.days.flatMap((d) => d.items);
  return [...fromDays, ...model.localSecrets];
}

export async function enrichItinerary(
  req: PlanRequest,
  model: ModelItinerary
): Promise<Itinerary> {
  const places = allPlaces(model);
  const geoResults = await geocodeMany(places.map((p) => p.geoQuery));

  // Re-attach geocodes in the same order we flattened.
  const enriched = places.map((p, i) => toEnrichedPlace(p, geoResults[i]));

  let cursor = 0;
  const days = model.days.map((d) => ({
    day: d.day,
    theme: d.theme,
    items: d.items.map(() => enriched[cursor++]),
  }));
  const localSecrets = model.localSecrets.map(() => enriched[cursor++]);

  // Heritage grounding: Wikipedia summary for the destination (hero) + the top
  // few attractions for citeable sources.
  const topAttractionTitles = model.days
    .flatMap((d) => d.items)
    .filter((p) => p.type === "attraction")
    .slice(0, 3)
    .map((p) => p.name);

  const [hero, sources] = await Promise.all([
    wikiSummary(model.destinationFull.split(",")[0].trim()).then(
      (r) => r ?? wikiSummary(model.destinationFull)
    ),
    wikiMany(topAttractionTitles),
  ]);

  // Prefer a geocoded destination centre; fall back to the mean of verified pins.
  const destGeo = (await geocodeMany([model.destinationFull]))[0];
  const center = destGeo
    ? { lat: destGeo.lat, lng: destGeo.lng }
    : computeCenter(enriched);

  const dedupedSources = dedupeSources(hero, sources);

  return {
    input: req,
    destinationFull: model.destinationFull,
    story: model.story,
    heritageSummary: model.heritageSummary,
    center,
    days,
    localSecrets,
    events: model.events,
    experiences: model.experiences,
    phrases: model.phrases,
    etiquette: model.etiquette,
    hero,
    sources: dedupedSources,
    generatedAt: new Date().toISOString(),
  };
}

function dedupeSources(hero: WikiRef | null, sources: WikiRef[]): WikiRef[] {
  const seen = new Set<string>();
  if (hero) seen.add(hero.url);
  return sources.filter((s) => {
    if (seen.has(s.url)) return false;
    seen.add(s.url);
    return true;
  });
}
