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

/** A place after we verify it against OpenStreetMap. */
export interface EnrichedPlace extends Place {
  lat: number | null;
  lng: number | null;
  verified: boolean; // true when OSM returned a real coordinate
  osmUrl: string | null;
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
  phrase: string;
  meaning: string;
}

/** Raw structured output from Gemini. */
export interface ModelItinerary {
  destinationFull: string;
  story: string;
  heritageSummary: string;
  days: DayPlan[];
  localSecrets: Place[];
  events: LocalEvent[];
  experiences: Experience[];
  phrases: Phrase[];
  etiquette: string[];
}

export interface WikiRef {
  title: string;
  extract: string;
  image: string | null;
  url: string;
}

/** How an itinerary was produced — for observability and a subtle UI badge. */
export interface OrchestrationMeta {
  mode: "ensemble" | "single"; // ensemble = NVIDIA panel used; single = Gemini only
  synthesizer: "gemini";
  panel: Array<{ model: string; ok: boolean; ms: number }>;
  panelistsUsed: number; // candidates that actually fed the synthesizer
  degraded: boolean; // true when we fell back below a full ensemble
}

/** Final payload sent to the client and persisted for share links. */
export interface Itinerary {
  input: PlanRequest;
  destinationFull: string;
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
