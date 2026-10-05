// Shared types for Wanderlore. The model produces `ModelItinerary`; the server
// then enriches every place with real OpenStreetMap coordinates and a Wikipedia
// source, producing the final `Itinerary` the UI renders.

export type Pace = "relaxed" | "balanced" | "packed";

export interface PlanRequest {
  destination: string;
  interests: string[];
  days: number;
  pace: Pace;
  note?: string;
}

export type PlaceType = "attraction" | "gem";

/** A single place the model recommends, before geocoding. */
export interface Place {
  name: string;
  type: PlaceType;
  blurb: string; // what it is / why it moves you
  significance: string; // cultural or heritage significance
  bestTime: string; // e.g. "Early morning, before crowds"
  geoQuery: string; // "Name, City, Country" — used for OSM geocoding
}

/** Outcome of checking a place on OpenStreetMap inside the destination. */
export type GeoStatus = "verified" | "not_found" | "unchecked";

/** A place after we verify it against OpenStreetMap. */
export interface EnrichedPlace extends Place {
  lat: number | null;
  lng: number | null;
  verified: boolean; // true when OSM found it inside the destination
  geoStatus?: GeoStatus; // missing on trips saved before statuses existed
  osmUrl: string | null;
  osmName?: string; // OSM's own name, when repair found it under a different one
}

export interface DayPlan {
  day: number;
  theme: string;
  items: Place[];
}

export interface EnrichedDayPlan {
  day: number;
  theme: string;
  items: EnrichedPlace[];
}

export interface LocalEvent {
  name: string;
  whenTypical: string; // "Mid-July, annually" — seasonal, not a fabricated date
  description: string;
  culturalRoot: string;
}

export interface Experience {
  title: string;
  description: string;
  howToEngage: string;
  respectfulTip: string;
}

export interface Phrase {
  phrase: string; // in the language's own script, as a voice should read it
  meaning: string;
  lang?: string; // BCP 47 tag, e.g. "ja-JP" (missing on trips saved before it existed)
  pronunciation?: string; // a guide an English speaker can read aloud, e.g. "oh-KEE-nee"
}

/** Raw structured output from Gemini. */
export interface ModelItinerary {
  destinationFull: string;
  noteFit?: string; // how the plan reflects the traveller's note; "" when there is none
  story: string;
  heritageSummary: string;
  days: DayPlan[];
  localSecrets: Place[];
  events: LocalEvent[];
  experiences: Experience[];
  phrases: Phrase[];
  etiquette: string[];
}

/** Author and licence of a Wikimedia Commons photo, shown next to it. */
export interface ImageCredit {
  artist: string;
  license: string; // e.g. "CC BY-SA 2.0"
  licenseUrl: string | null;
  fileUrl: string; // the Commons file page
}

export interface WikiRef {
  title: string;
  extract: string;
  image: string | null;
  url: string;
  imageCredit?: ImageCredit | null;
}

/** One Gemini request: which model, how it ended, how long it took. */
export interface GenerationAttempt {
  model: string;
  status: number | "timeout" | "network" | "blocked" | "empty" | "bad-json";
  ms: number;
}

/** How an itinerary was produced — for observability and a subtle UI badge. */
export interface OrchestrationMeta {
  mode: "ensemble" | "single"; // ensemble = NVIDIA panel used; single = Gemini only
  synthesizer: "gemini";
  panel: Array<{ model: string; ok: boolean; ms: number }>;
  panelistsUsed: number; // candidates that actually fed the synthesizer
  degraded: boolean; // true when we fell back below a full ensemble
  model?: string; // the Gemini model version that wrote the final plan
  attempts?: GenerationAttempt[]; // every Gemini request made, in order
}

/** What a span timed (see lib/trace.ts). */
export type SpanName =
  | "destination" // looking up the destination itself
  | "panel" // one NVIDIA panelist
  | "gemini" // one request for the itinerary
  | "lookup" // one place search on OpenStreetMap
  | "repair" // the request asking for OpenStreetMap names of places not found
  | "repair-lookup" // searching one of those names
  | "wikipedia" // one summary
  | "photo-credit"; // the hero photo's author and licence

/** One timed step of a /api/plan request. */
export interface TraceSpan {
  name: SpanName;
  start: number; // ms since the request started
  ms: number;
  outcome: string; // "found", "not found", "503", "timeout"...
  detail?: string; // the query, model or page title
  cached?: boolean; // answered from the cache, no network call
}

/** Every step of one request, in start order. Not saved with share links. */
export interface PlanTrace {
  totalMs: number;
  spans: TraceSpan[];
}

/** Final payload sent to the client and persisted for share links. */
export interface Itinerary {
  input: PlanRequest;
  destinationFull: string;
  noteFit?: string; // missing on plans made before it existed
  story: string;
  heritageSummary: string;
  center: { lat: number; lng: number } | null;
  days: EnrichedDayPlan[];
  localSecrets: EnrichedPlace[];
  events: LocalEvent[];
  experiences: Experience[];
  phrases: Phrase[];
  etiquette: string[];
  hero: WikiRef | null;
  sources: WikiRef[];
  generatedAt: string;
}
