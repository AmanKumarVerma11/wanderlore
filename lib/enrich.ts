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
import { geocodePlaces, type Destination, type PlaceLookup } from "./geocode";
import { repairNotFound } from "./repair";
import { imageCredit, wikiMany, wikiSummary } from "./wiki";

/** Pure: merge a place with the result of looking it up. */
export function toEnrichedPlace(place: Place, lookup: PlaceLookup): EnrichedPlace {
  return {
    ...place,
    lat: lookup.geo?.lat ?? null,
    lng: lookup.geo?.lng ?? null,
    verified: lookup.status === "verified",
    geoStatus: lookup.status,
    osmUrl: lookup.geo?.osmUrl ?? null,
    ...(lookup.matchedName ? { osmName: lookup.matchedName } : {}),
  };
}

/** Flatten every place across days + localSecrets in a stable order. */
function allPlaces(model: ModelItinerary): Place[] {
  const fromDays = model.days.flatMap((d) => d.items);
  return [...fromDays, ...model.localSecrets];
}

export async function enrichItinerary(
  req: PlanRequest,
  model: ModelItinerary,
  dest: Destination,
  deadline = Date.now() + 30_000
): Promise<Itinerary> {
  const places = allPlaces(model);

  // Heritage grounding: Wikipedia summary for the destination (hero) + the top
  // few attractions for citeable sources.
  const topAttractionTitles = model.days
    .flatMap((d) => d.items)
    .filter((p) => p.type === "attraction")
    .slice(0, 3)
    .map((p) => p.name);

  // Geocoding (then one repair round for places not found) and Wikipedia don't
  // depend on each other, so they run together.
  const [lookups, hero, sources] = await Promise.all([
    geocodePlaces(places, dest, deadline).then((first) =>
      repairNotFound(places, first, dest, deadline)
    ),
    wikiSummary(model.destinationFull.split(",")[0].trim())
      .then((r) => r ?? wikiSummary(model.destinationFull))
      .then(withImageCredit),
    wikiMany(topAttractionTitles),
  ]);

  // Re-attach lookups in the same order we flattened.
  const enriched = places.map((p, i) => toEnrichedPlace(p, lookups[i]));
  let cursor = 0;
  const days = model.days.map((d) => ({
    day: d.day,
    theme: d.theme,
    items: d.items.map(() => enriched[cursor++]),
  }));
  const localSecrets = model.localSecrets.map(() => enriched[cursor++]);

  return {
    input: req,
    destinationFull: model.destinationFull,
    // Only a real note gets a "shaped by your note" line, whatever the model wrote.
    noteFit: req.note ? model.noteFit?.trim() || undefined : undefined,
    story: model.story,
    heritageSummary: model.heritageSummary,
    center: { lat: dest.lat, lng: dest.lng },
    days,
    localSecrets,
    events: model.events,
    experiences: model.experiences,
    phrases: model.phrases,
    etiquette: model.etiquette,
    hero,
    sources: dedupeSources(hero, sources),
    generatedAt: new Date().toISOString(),
  };
}

/** Keep the hero photo only when its author and licence can be shown with it. */
async function withImageCredit(ref: WikiRef | null): Promise<WikiRef | null> {
  if (!ref?.image) return ref;
  const credit = await imageCredit(ref.image);
  return credit ? { ...ref, imageCredit: credit } : { ...ref, image: null };
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
