import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PlanRequest } from "./types";

vi.mock("./geocode", () => ({ geocodeDestination: vi.fn() }));
vi.mock("./orchestrator", () => ({
  generateItineraryEnsemble: vi.fn(async () => ({ model: { destinationFull: "Kyoto, Japan" }, meta: { mode: "single" } })),
}));
vi.mock("./enrich", () => ({ enrichItinerary: vi.fn(async () => ({ destinationFull: "Kyoto, Japan" })) }));

import { planTrip, PlanError } from "./plan";
import { geocodeDestination } from "./geocode";
import { generateItineraryEnsemble } from "./orchestrator";
import { enrichItinerary } from "./enrich";

const REQ: PlanRequest = { destination: "Kyoto", interests: ["Heritage & history"], days: 2, pace: "balanced" };
const KYOTO = { lat: 35, lng: 135.7, bbox: [34.8, 35.3, 135.5, 135.9] as [number, number, number, number], countryCode: "jp", displayName: "Kyoto, Japan" };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("planTrip", () => {
  it("rejects a destination OSM doesn't know, before any model call", async () => {
    vi.mocked(geocodeDestination).mockResolvedValue(null);
    const err = await planTrip(REQ).catch((e) => e);
    expect(err).toBeInstanceOf(PlanError);
    expect(err.status).toBe(422);
    expect(generateItineraryEnsemble).not.toHaveBeenCalled();
  });

  it("reports the map service being down as a 503, not 'destination not found'", async () => {
    vi.mocked(geocodeDestination).mockResolvedValue(undefined);
    const err = await planTrip(REQ).catch((e) => e);
    expect(err.status).toBe(503);
    expect(generateItineraryEnsemble).not.toHaveBeenCalled();
  });

  it("plans for the place OSM resolved, within one deadline", async () => {
    vi.mocked(geocodeDestination).mockResolvedValue(KYOTO);
    const deadline = Date.now() + 55_000;
    await planTrip(REQ, deadline);
    expect(generateItineraryEnsemble).toHaveBeenCalledWith(REQ, { deadline, resolvedAs: "Kyoto, Japan" });
    expect(enrichItinerary).toHaveBeenCalledWith(REQ, { destinationFull: "Kyoto, Japan" }, KYOTO, deadline);
  });
});
