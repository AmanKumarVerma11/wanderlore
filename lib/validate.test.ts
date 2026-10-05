import { describe, it, expect } from "vitest";
import { validatePlanRequest, isSavableItinerary, INTERESTS } from "./validate";
import type { Itinerary } from "./types";

describe("validatePlanRequest", () => {
  const valid = {
    destination: "Kyoto",
    interests: [INTERESTS[0], INTERESTS[1]],
    days: 3,
    pace: "balanced",
  };

  it("accepts a well-formed request and normalises it", () => {
    const r = validatePlanRequest(valid);
    expect(r.ok).toBe(true);
    expect(r.value).toMatchObject({
      destination: "Kyoto",
      days: 3,
      pace: "balanced",
    });
    expect(r.value?.interests).toHaveLength(2);
  });

  it("trims the destination", () => {
    const r = validatePlanRequest({ ...valid, destination: "  Lisbon  " });
    expect(r.value?.destination).toBe("Lisbon");
  });

  it("rejects an empty destination", () => {
    const r = validatePlanRequest({ ...valid, destination: "" });
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/destination/i);
  });

  it("rejects when no interests are provided", () => {
    const r = validatePlanRequest({ ...valid, interests: [] });
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/interest/i);
  });

  it("filters out unknown interests", () => {
    const r = validatePlanRequest({
      ...valid,
      interests: [INTERESTS[0], "Skydiving", "Casinos"],
    });
    expect(r.ok).toBe(true);
    expect(r.value?.interests).toEqual([INTERESTS[0]]);
  });

  it("rejects out-of-range trip lengths", () => {
    expect(validatePlanRequest({ ...valid, days: 0 }).ok).toBe(false);
    expect(validatePlanRequest({ ...valid, days: 8 }).ok).toBe(false);
    expect(validatePlanRequest({ ...valid, days: 30 }).ok).toBe(false);
  });

  it("coerces a numeric-string day value", () => {
    const r = validatePlanRequest({ ...valid, days: "4" });
    expect(r.ok).toBe(true);
    expect(r.value?.days).toBe(4);
  });

  it("defaults pace to balanced only when valid values are given", () => {
    expect(validatePlanRequest({ ...valid, pace: "packed" }).value?.pace).toBe(
      "packed"
    );
    expect(validatePlanRequest({ ...valid, pace: "sprint" }).ok).toBe(false);
  });

  it("truncates and keeps an optional note", () => {
    const long = "a".repeat(500);
    const r = validatePlanRequest({ ...valid, note: long });
    expect(r.value?.note?.length).toBe(400);
  });

  it("rejects non-object bodies", () => {
    expect(validatePlanRequest(null).ok).toBe(false);
    expect(validatePlanRequest("nope").ok).toBe(false);
  });
});

describe("isSavableItinerary", () => {
  const place = (osmUrl: string | null) => ({
    name: "Fushimi Inari",
    type: "attraction" as const,
    blurb: "b",
    significance: "s",
    bestTime: "t",
    geoQuery: "Fushimi Inari, Kyoto, Japan",
    lat: 34.96,
    lng: 135.77,
    verified: osmUrl !== null,
    osmUrl,
  });
  const ref = {
    title: "Kyoto",
    extract: "e",
    image: "https://upload.wikimedia.org/wikipedia/commons/a/ab/x.jpg",
    url: "https://en.wikipedia.org/wiki/Kyoto",
  };
  const valid = (): Itinerary => ({
    input: { destination: "Kyoto", interests: [INTERESTS[0]], days: 1, pace: "balanced" },
    destinationFull: "Kyoto, Japan",
    story: "s",
    heritageSummary: "h",
    center: null,
    days: [{ day: 1, theme: "t", items: [place("https://www.openstreetmap.org/node/1"), place(null)] }],
    localSecrets: [place("https://www.openstreetmap.org/way/2")],
    events: [],
    experiences: [],
    phrases: [],
    etiquette: [],
    hero: ref,
    sources: [ref],
    generatedAt: "2026-10-03T00:00:00.000Z",
  });

  it("accepts an itinerary the server produced", () => {
    expect(isSavableItinerary(valid())).toBe(true);
  });

  it("rejects a javascript: URL anywhere it would be rendered", () => {
    const bad = "javascript:alert(document.domain)";
    const inDay = valid();
    inDay.days[0].items[0].osmUrl = bad;
    const inSecret = valid();
    inSecret.localSecrets[0].osmUrl = bad;
    const inHero = valid();
    inHero.hero = { ...ref, url: bad };
    const inImage = valid();
    inImage.hero = { ...ref, image: bad };
    const inSource = valid();
    inSource.sources = [{ ...ref, url: bad }];
    for (const it of [inDay, inSecret, inHero, inImage, inSource]) {
      expect(isSavableItinerary(it)).toBe(false);
    }
  });

  it("rejects payloads without the basic shape", () => {
    expect(isSavableItinerary(null)).toBe(false);
    expect(isSavableItinerary({ destinationFull: "x" })).toBe(false);
    expect(isSavableItinerary({ days: [] })).toBe(false);
  });
});
