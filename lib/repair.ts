// One targeted re-ask for places OpenStreetMap couldn't find (roadmap R4a). This
// is the LLM-Modulo loop: the verifier's findings go back to the model, and what
// it proposes is verified again before anyone sees it. In the M1 eval, 49 of 247
// places weren't found, mostly English names for places OSM lists under their
// local name ("Chora Mosque" is "Kariye Camii" there), so the model is asked for
// that name only. It may not suggest a different place.

import type { Place } from "./types";
import { geminiJson } from "./gemini";
import { boundedQueries, geocodePlaces, type Destination, type PlaceLookup } from "./geocode";
import { startSpan } from "./trace";

// Its own model first, with its own free daily quota (500 requests on this
// project), so repair normally doesn't spend the generation model's quota; then
// the generation model. Load moves between them: later on 2026-10-03 the first
// took 14.6s and 22.9s (and once sent a 503 after 8.4s) for a 40-token answer,
// while the second answered the same prompt in about 1s.
export const REPAIR_MODELS = Array.from(
  new Set([process.env.GEMINI_REPAIR_MODEL || "gemini-3.1-flash-lite", "gemini-3.5-flash-lite"])
);

const LOOKUP_MS = 1_100; // one paced Nominatim request
const AFTER_ANSWER_MS = LOOKUP_MS + 1_500; // time for at least one lookup of an answer
// Measured 2026-10-03 on the 49 places the M1 eval didn't find (18 trips, one call
// each, the model healthy): 1.5s at the median, 4.3s at most. It found 21 of them.
// An attempt slower than that is a loaded model, so the next one gets a turn.
const ATTEMPT_MS = 4_500;

const SCHEMA = {
  type: "object",
  properties: {
    places: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "integer" },
          osmName: { type: "string", nullable: true },
        },
        required: ["id", "osmName"],
      },
    },
  },
  required: ["places"],
} as const;

export function buildRepairPrompt(dest: Destination, misses: Place[]): string {
  return [
    `These places are in ${dest.displayName}. A search of OpenStreetMap inside that area found nothing under the names below.`,
    "For each one, give the name it most likely has on OpenStreetMap: usually the local-language name, spelled and accented as on the sign, in the script OpenStreetMap uses there. Give only the name, with no city or address.",
    "If you are not confident the place exists, give null. Never suggest a different place.",
    "",
    ...misses.map((p, i) => {
      const other = boundedQueries(p).filter((q) => q !== p.name);
      const aka = other.length ? ` (also searched as "${other.join('", "')}")` : "";
      return `${i + 1}. ${p.name}${aka}: ${p.blurb.slice(0, 120)}`;
    }),
  ].join("\n");
}

/** The model's answers by position; anything malformed becomes null. */
export function parseRepair(reply: unknown, count: number): Array<string | null> {
  const out: Array<string | null> = Array(count).fill(null);
  const places = (reply as { places?: unknown })?.places;
  if (!Array.isArray(places)) return out;
  for (const p of places as Array<{ id?: unknown; osmName?: unknown }>) {
    const i = Number(p?.id) - 1;
    const name = typeof p?.osmName === "string" ? p.osmName.trim() : "";
    // A real place name has no quotes, braces or line breaks (Gemma 4 once
    // returned a fragment of JSON as a name).
    if (Number.isInteger(i) && i >= 0 && i < count && name.length >= 2 && name.length <= 120 && !/["{}\\\n]/.test(name)) {
      out[i] = name;
    }
  }
  return out;
}

const normalize = (s: string) => s.trim().toLowerCase();

/**
 * Ask once for the OpenStreetMap names of places marked not found (the next
 * model only if the first fails), and look up the new names. Best-effort: when
 * there's no time, or every model fails, the first pass's statuses stand. Places
 * found get OSM's own name.
 */
export async function repairNotFound(
  places: Place[],
  lookups: PlaceLookup[],
  dest: Destination,
  deadline: number
): Promise<PlaceLookup[]> {
  const missing = lookups.flatMap((l, i) => (l.status === "not_found" ? [i] : []));
  if (missing.length === 0) return lookups;
  if (deadline - Date.now() < ATTEMPT_MS + AFTER_ANSWER_MS) {
    startSpan("repair")("skipped: no time");
    return lookups;
  }

  let names: Array<string | null>;
  try {
    const { value } = await geminiJson<unknown>({
      prompt: buildRepairPrompt(dest, missing.map((i) => places[i])),
      schema: SCHEMA,
      models: REPAIR_MODELS,
      deadline,
      reserveMs: AFTER_ANSWER_MS,
      minAttemptMs: ATTEMPT_MS,
      maxAttemptMs: ATTEMPT_MS,
      temperature: 0.2,
      span: "repair",
    });
    names = parseRepair(value, missing.length);
  } catch {
    return lookups; // the failed attempt is already in the trace
  }

  // Only names that weren't already searched.
  const retry = missing.flatMap((placeIndex, k) => {
    const name = names[k];
    if (!name) return [];
    const tried = boundedQueries(places[placeIndex]).map(normalize);
    return tried.includes(normalize(name)) ? [] : [{ placeIndex, name }];
  });
  if (retry.length === 0) return lookups;

  // Repair lookups only accept a place OSM actually calls by the proposed name.
  const found = await geocodePlaces(
    retry.map((r) => ({ name: r.name, geoQuery: r.name })),
    dest,
    deadline,
    { repair: true }
  );
  const out = [...lookups];
  retry.forEach((r, k) => {
    const hit = found[k];
    if (hit.status === "verified" && hit.geo) {
      out[r.placeIndex] = { status: "verified", geo: hit.geo, matchedName: hit.geo.name ?? r.name };
    }
  });
  return out;
}
