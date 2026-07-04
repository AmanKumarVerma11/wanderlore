import { describe, it, expect } from "vitest";
import { toEnrichedPlace, computeCenter } from "./enrich";
import type { Place, EnrichedPlace } from "./types";

const place: Place = {
  name: "Fushimi Inari",
  type: "attraction",
  blurb: "Thousands of vermilion torii gates.",
  significance: "Shinto shrine to the rice god Inari.",
  bestTime: "Early morning",
  geoQuery: "Fushimi Inari, Kyoto, Japan",
};

describe("toEnrichedPlace", () => {
  it("marks a place verified when a geocode result is present", () => {
    const e = toEnrichedPlace(place, {
      lat: 34.96,
      lng: 135.77,
      osmUrl: "https://osm/x",
    });
    expect(e.verified).toBe(true);
    expect(e.lat).toBe(34.96);
    expect(e.osmUrl).toBe("https://osm/x");
  });

  it("marks a place unverified when geocoding failed", () => {
    const e = toEnrichedPlace(place, null);
    expect(e.verified).toBe(false);
    expect(e.lat).toBeNull();
    expect(e.osmUrl).toBeNull();
  });

  it("preserves the original place fields", () => {
    const e = toEnrichedPlace(place, null);
    expect(e.name).toBe(place.name);
    expect(e.significance).toBe(place.significance);
  });
});

describe("computeCenter", () => {
  const mk = (lat: number | null, lng: number | null, verified: boolean): EnrichedPlace => ({
    ...place,
    lat,
    lng,
    verified,
    osmUrl: null,
  });

  it("returns null when no places are verified", () => {
    expect(computeCenter([mk(null, null, false)])).toBeNull();
  });

  it("averages only verified coordinates", () => {
    const c = computeCenter([
      mk(0, 0, true),
      mk(10, 20, true),
      mk(999, 999, false), // ignored
    ]);
    expect(c).toEqual({ lat: 5, lng: 10 });
  });
});
