import type { PlanRequest } from "./types";

// All prompt construction lives here so every code path — the single-model plan,
// the ensemble panelists, and the synthesizer — targets the same ModelItinerary
// content contract. gemini.ts re-exports buildPrompt for back-compat.

function itemsPerDay(req: PlanRequest): string {
  return req.pace === "relaxed" ? "2-3" : req.pace === "packed" ? "4-5" : "3-4";
}

function travellerBrief(req: PlanRequest): string {
  return [
    "Traveller brief:",
    `- Destination: ${req.destination}`,
    `- Interests: ${req.interests.join(", ")}`,
    `- Trip length: ${req.days} day(s)`,
    `- Pace: ${req.pace} (about ${itemsPerDay(req)} places per day)`,
    req.note ? `- Notes: ${req.note}` : "- Notes: none",
  ].join("\n");
}

// The shared field spec (1-9). Both the single-model prompt and the synthesis
// prompt reference it, so the strict-schema output stays consistent everywhere.
const PRODUCTION_SPEC = [
  "Produce:",
  "1. destinationFull: the destination as 'City, Country' (resolve informal names).",
  "2. story: 2-3 vivid paragraphs telling the cultural soul and history of the",
  "   place — immersive storytelling that makes the reader feel its atmosphere.",
  "3. heritageSummary: 2-4 sentences on the heritage that defines it (traditions,",
  "   UNESCO sites, crafts, cuisine) and why it matters.",
  "4. days: one entry per day with a theme and a mix of items. Each item is a real,",
  "   verifiable place. Mark famous sites as type 'attraction' and lesser-known,",
  "   locally-loved spots as type 'gem'. Include at least one 'gem' most days.",
  "   For geoQuery give ONE specific, mappable place as 'Place, City, Country'",
  "   (a single named site — never a list, range, or 'A and B'; pick the main one).",
  "5. localSecrets: 3-5 extra hidden gems (type 'gem') a typical tourist misses.",
  "6. events: 3-5 established, recurring cultural events/festivals. For whenTypical",
  "   give the usual season or month (e.g. 'Mid-July, annually') — never invent an",
  "   exact date. Only include events you are confident genuinely recur there.",
  "7. experiences: 3-5 authentic, participatory cultural experiences (workshops,",
  "   ceremonies, shared meals) with how to engage and a respectful tip.",
  "8. phrases: 4-6 useful local-language phrases with meanings.",
  "9. etiquette: 4-6 concise cultural etiquette / respect tips.",
].join("\n");

/** Single-model prompt (phase 1 path + ensemble terminal fallback). */
export function buildPrompt(req: PlanRequest): string {
  return [
    "You are a knowledgeable local cultural guide and storyteller. Craft a rich,",
    "authentic cultural discovery plan for a traveller. Prioritise meaningful,",
    "respectful engagement with local culture over generic tourist checklists.",
    "",
    travellerBrief(req),
    "",
    PRODUCTION_SPEC,
    "",
    "Be accurate. Only name places and events that genuinely exist. If unsure a",
    "place is real, omit it. Return ONLY JSON matching the provided schema.",
  ].join("\n");
}

/**
 * Panelist prompt — one member of the diverse model panel. Asks for a free-form
 * but well-structured MARKDOWN draft (not JSON), so the weaker-JSON NVIDIA models
 * can focus on quality and diversity of ideas. The Gemini synthesizer turns the
 * best of these into the strict schema.
 */
export function buildPanelistPrompt(req: PlanRequest): string {
  return [
    "You are a local cultural expert briefing a lead travel writer. Give your BEST,",
    "most authentic picks for this traveller as a CONCISE markdown outline — bullets,",
    "not full prose; the writer will expand it. Favour genuine hidden gems and",
    "meaningful cultural engagement over generic tourist lists.",
    "",
    travellerBrief(req),
    "",
    "Cover briefly:",
    `- Day-by-day picks (${req.days} day(s), ~${itemsPerDay(req)} places/day): each place`,
    "  as name + 'attraction' or 'gem' + a 3-6 word why.",
    "- 3-5 hidden gems most tourists miss (name + a few words).",
    "- 3-5 recurring festivals/events (name + typical season, never exact dates).",
    "- 3-5 authentic participatory experiences (a few words each).",
    "- A one-line angle for the cultural story, plus a short heritage note.",
    "- 4-6 useful local phrases; 4-6 terse etiquette tips.",
    "",
    "Only real, specific, mappable places you are confident exist. Be concise.",
  ].join("\n");
}

/**
 * Synthesis prompt — Gemini reads the panel's candidate drafts and composes the
 * single best plan, then emits strict-schema JSON (enforced by responseSchema).
 * Caps the number of mapped places to keep downstream OSM geocoding within the
 * serverless time budget while favouring the most verifiable, authentic picks.
 */
export function buildSynthesisPrompt(
  req: PlanRequest,
  candidates: string[],
  maxPlaces: number
): string {
  const drafts = candidates
    .map((c, i) => `----- DRAFT ${i + 1} -----\n${c.trim()}`)
    .join("\n\n");
  return [
    "You are an expert travel editor. Several independent local guides each drafted",
    "a cultural plan for the SAME traveller (below). Read every draft, then compose",
    "the single BEST plan by combining their strongest, most authentic ideas.",
    "",
    "Editorial rules:",
    "- Merge and DEDUPE places; never repeat the same place across days or secrets.",
    "- Prefer real, specific, mappable places you are confident genuinely exist;",
    "  drop anything vague, invented, or that a draft seems unsure about.",
    `- Keep the total number of mapped places (days + localSecrets combined) to at`,
    `  most ${maxPlaces}, choosing the most culturally meaningful and verifiable.`,
    "- Keep the best storytelling and heritage insight; tighten weak writing.",
    "- Respect the traveller's interests, trip length, and pace.",
    "",
    travellerBrief(req),
    "",
    "Candidate drafts:",
    drafts,
    "",
    PRODUCTION_SPEC,
    "",
    "Be accurate. Only name places and events that genuinely exist. Return ONLY",
    "JSON matching the provided schema.",
  ].join("\n");
}
