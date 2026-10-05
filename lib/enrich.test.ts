import { describe, it, expect, vi } from "vitest";
import type { ModelItinerary, Place } from "./types";
import type { Destination } from "./geocode";

vi.mock("./geocode", () => ({ geocodePlaces: vi.fn() }));
vi.mock("./repair", () => ({
  repairNotFound: vi.fn(async (_places: unknown, lookups: unknown) => lookups),
}));
vi.mock("./wiki", () => ({
  wikiSummary: vi.fn(async () => ({
    title: "Kyoto",
    extract: "e",
    image: "https://thumb.wikimedia.org/wikipedia/commons/thumb/a/ab/K.jpg/330px-K.jpg",
    url: "https://en.wikipedia.org/wiki/Kyoto",
  })),
  wikiMany: vi.fn(async () => []),
  imageCredit: vi.fn(async () => null), // licence unknown
}));

import { enrichItinerary, toEnrichedPlace } from "./enrich";
import { geocodePlaces } from "./geocode";
import { repairNotFound } from "./repair";

const place: Place = {
  name: "Fushimi Inari",
  type: "attraction",
  blurb: "Thousands of vermilion torii gates.",
  significance: "Shinto shrine to the rice god Inari.",
  bestTime: "Early morning",
  geoQuery: "Fushimi Inari, Kyoto, Japan",
};

describe("toEnrichedPlace", () => {
  it("marks a place verified when OSM found it inside the destination", () => {
    const e = toEnrichedPlace(place, {
      status: "verified",
      geo: { lat: 34.96, lng: 135.77, osmUrl: "https://osm/x" },
    });
    expect(e.verified).toBe(true);
    expect(e.geoStatus).toBe("verified");
    expect(e.lat).toBe(34.96);
    expect(e.osmUrl).toBe("https://osm/x");
  });

  it("keeps 'not found' and 'not checked' apart, neither verified", () => {
    for (const status of ["not_found", "unchecked"] as const) {
      const e = toEnrichedPlace(place, { status, geo: null });
      expect(e.verified).toBe(false);
      expect(e.geoStatus).toBe(status);
      expect(e.lat).toBeNull();
      expect(e.osmUrl).toBeNull();
    }
  });

  it("preserves the original place fields", () => {
    const e = toEnrichedPlace(place, { status: "not_found", geo: null });
    expect(e.name).toBe(place.name);
    expect(e.significance).toBe(place.significance);
    expect(e).not.toHaveProperty("osmName");
  });

  it("keeps the name OSM knows a repaired place by", () => {
    const e = toEnrichedPlace(place, {
      status: "verified",
      geo: { lat: 34.96, lng: 135.77, osmUrl: "https://osm/x" },
      matchedName: "伏見稲荷大社",
    });
    expect(e.osmName).toBe("伏見稲荷大社");
  });
});

describe("enrichItinerary", () => {
  const dest: Destination = {
    lat: 35.01,
    lng: 135.77,
    bbox: [34.8, 35.3, 135.5, 135.9],
    countryCode: "jp",
    displayName: "Kyoto, Japan",
  };
  const model = {
    destinationFull: "Kyoto, Japan",
    days: [
      { day: 1, theme: "a", items: [{ ...place, name: "A" }, { ...place, name: "B" }] },
      { day: 2, theme: "b", items: [{ ...place, name: "C" }] },
    ],
    localSecrets: [{ ...place, name: "D", type: "gem" }],
    events: [],
    experiences: [],
    phrases: [],
    etiquette: [],
  } as unknown as ModelItinerary;

  it("puts each lookup back on its own place, centred on the destination", async () => {
    vi.mocked(geocodePlaces).mockResolvedValue([
      { status: "verified", geo: { lat: 1, lng: 1, osmUrl: "https://www.openstreetmap.org/node/1" } },
      { status: "not_found", geo: null },
      { status: "unchecked", geo: null },
      { status: "verified", geo: { lat: 2, lng: 2, osmUrl: "https://www.openstreetmap.org/node/2" } },
    ]);
    const it = await enrichItinerary(
      { destination: "Kyoto", interests: ["Heritage & history"], days: 2, pace: "balanced" },
      model,
      dest
    );
    expect(it.days[0].items.map((p) => [p.name, p.geoStatus])).toEqual([
      ["A", "verified"],
      ["B", "not_found"],
    ]);
    expect(it.days[1].items[0].geoStatus).toBe("unchecked");
    expect(it.localSecrets[0]).toMatchObject({ name: "D", verified: true, lat: 2 });
    expect(it.center).toEqual({ lat: 35.01, lng: 135.77 });
  });

  it("sends the first pass to repair and uses what it returns", async () => {
    const first = [
      { status: "verified" as const, geo: { lat: 1, lng: 1, osmUrl: "https://www.openstreetmap.org/node/1" } },
      { status: "not_found" as const, geo: null },
      { status: "not_found" as const, geo: null },
      { status: "verified" as const, geo: { lat: 2, lng: 2, osmUrl: "https://www.openstreetmap.org/node/2" } },
    ];
    vi.mocked(geocodePlaces).mockResolvedValue(first);
    vi.mocked(repairNotFound).mockImplementationOnce(async (_places, lookups) => [
      lookups[0],
      { status: "verified", geo: { lat: 3, lng: 3, osmUrl: "https://www.openstreetmap.org/node/3" }, matchedName: "B local" },
      lookups[2],
      lookups[3],
    ]);
    const deadline = Date.now() + 40_000;
    const it = await enrichItinerary(
      { destination: "Kyoto", interests: ["Heritage & history"], days: 2, pace: "balanced" },
      model,
      dest,
      deadline
    );
    expect(repairNotFound).toHaveBeenCalledWith(expect.any(Array), first, dest, deadline);
    expect(it.days[0].items[1]).toMatchObject({ name: "B", verified: true, osmName: "B local" });
    expect(it.days[1].items[0].geoStatus).toBe("not_found");
  });

  it("keeps the model's note line only when the traveller wrote a note", async () => {
    vi.mocked(geocodePlaces).mockResolvedValue([]);
    const noPlaces = { ...model, days: [], localSecrets: [], noteFit: " Day 2 is the Triund trek. " };
    const req = { destination: "Kyoto", interests: ["Heritage & history"], days: 1, pace: "balanced" as const };
    expect((await enrichItinerary({ ...req, note: "off beat treks" }, noPlaces, dest)).noteFit).toBe("Day 2 is the Triund trek.");
    expect((await enrichItinerary(req, noPlaces, dest)).noteFit).toBeUndefined();
  });

  it("drops the hero photo when its licence can't be confirmed", async () => {
    vi.mocked(geocodePlaces).mockResolvedValue([]);
    const it = await enrichItinerary(
      { destination: "Kyoto", interests: ["Heritage & history"], days: 1, pace: "balanced" },
      { ...model, days: [], localSecrets: [] },
      dest
    );
    expect(it.hero?.image).toBeNull();
    expect(it.hero?.url).toBe("https://en.wikipedia.org/wiki/Kyoto");
  });
});
