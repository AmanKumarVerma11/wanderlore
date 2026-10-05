// The whole /api/plan pipeline, shared by the route and the eval runner (so the
// eval measures exactly what users get): destination check, generation, then
// grounding. HTTP concerns (region, rate limits) stay in the route.

import type { Itinerary, OrchestrationMeta, PlanRequest, PlanTrace } from "./types";
import { geocodeDestination, type Destination } from "./geocode";
import { generateItineraryEnsemble } from "./orchestrator";
import { enrichItinerary } from "./enrich";
import { withTrace } from "./trace";

// Inside the route's maxDuration of 60s, leaving room to send the response.
export const REQUEST_BUDGET_MS = 55_000;

export class PlanError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "PlanError";
    this.status = status;
  }
}

export interface PlanResult {
  itinerary: Itinerary;
  meta: OrchestrationMeta;
  dest: Destination;
  trace: PlanTrace; // every lookup and model call, timed
}

export async function planTrip(
  req: PlanRequest,
  deadline = Date.now() + REQUEST_BUDGET_MS
): Promise<PlanResult> {
  const { value, trace } = await withTrace(async () => {
    // Cheap deterministic check first: no model call for a place OSM doesn't know.
    const dest = await geocodeDestination(req.destination, deadline);
    if (dest === undefined) {
      throw new PlanError("The map service isn't responding right now. Please try again shortly.", 503);
    }
    if (dest === null) {
      throw new PlanError(
        "We couldn't find that destination on the map. Try a city, region or country name.",
        422
      );
    }

    const { model, meta } = await generateItineraryEnsemble(req, {
      deadline,
      resolvedAs: dest.displayName,
    });
    const itinerary = await enrichItinerary(req, model, dest, deadline);
    return { itinerary, meta, dest };
  });
  return { ...value, trace };
}
