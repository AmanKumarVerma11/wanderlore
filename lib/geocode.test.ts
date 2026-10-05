import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Destination } from "./geocode";

const KYOTO: Destination = {
  lat: 35.0116,
  lng: 135.7681,
  bbox: [34.8, 35.3, 135.5, 135.9],
  countryCode: "jp",
  displayName: "Kyoto, Kyoto Prefecture, Japan",
};

// Nominatim stub: returns a hit for the queries listed, [] for anything else.
function stubNominatim(hits: Record<string, number>, status = 200) {
  const fetchMock = vi.fn(async (url: string) => {
    if (status !== 200) return new Response("busy", { status });
    const q = new URL(url).searchParams.get("q") ?? "";
    const id = hits[q];
    return Response.json(
      id === undefined ? [] : [{ lat: "35.0", lon: "135.7", osm_type: "node", osm_id: id }]
    );
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

// Fresh module per test: its throttle clock and cache start empty.
async function load() {
  vi.resetModules();
  return import("./geocode");
}

// Run a lookup to completion, fast-forwarding the 1.1s pacing between calls.
async function run<T>(p: Promise<T>): Promise<T> {
  await vi.runAllTimersAsync();
  return p;
}

const params = (call: unknown[]) => new URL(String(call[0])).searchParams;

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("boundedQueries", () => {
  it("tries the place name first, then the first part of its geoQuery", async () => {
    const { boundedQueries } = await load();
    expect(
      boundedQueries({ name: "Convento da Ordem do Carmo", geoQuery: "Carmo Convent, Lisbon, Portugal" })
    ).toEqual(["Convento da Ordem do Carmo", "Carmo Convent"]);
  });

  it("strips parenthetical notes and dedupes", async () => {
    const { boundedQueries } = await load();
    expect(
      boundedQueries({ name: "Nishiki Market (food street)", geoQuery: "Nishiki Market, Kyoto, Japan" })
    ).toEqual(["Nishiki Market"]);
  });
});

describe("geocodePlaces", () => {
  const places = [
    { name: "Fushimi Inari Taisha", geoQuery: "Fushimi Inari Shrine, Kyoto, Japan" },
    { name: "Philosopher's Path", geoQuery: "Philosopher's Path, Kyoto, Japan" },
  ];

  it("only searches inside the destination box and country", async () => {
    const fetchMock = stubNominatim({ "Fushimi Inari Taisha": 1 });
    const { geocodePlaces } = await load();
    await run(geocodePlaces(places, KYOTO));
    for (const call of fetchMock.mock.calls) {
      const p = params(call);
      expect(p.get("bounded")).toBe("1");
      expect(p.get("countrycodes")).toBe("jp");
      expect(p.get("viewbox")).toMatch(/^135\.\d+,35\.\d+,136\.\d+,34\.\d+$/);
    }
  });

  it("goes breadth-first and reports verified / not found", async () => {
    const fetchMock = stubNominatim({ "Fushimi Inari Taisha": 1 });
    const { geocodePlaces } = await load();
    const res = await run(geocodePlaces(places, KYOTO));
    expect(fetchMock.mock.calls.map((c) => params(c).get("q"))).toEqual([
      "Fushimi Inari Taisha", // first shape of every place...
      "Philosopher's Path",
      // ...then second shapes, only for misses (Philosopher's Path has just one).
    ]);
    expect(res.map((r) => r.status)).toEqual(["verified", "not_found"]);
    expect(res[0].geo?.osmUrl).toBe("https://www.openstreetmap.org/node/1");
  });

  it("marks places 'unchecked' once the call budget runs out, never 'not found'", async () => {
    stubNominatim({});
    const { geocodePlaces } = await load();
    const many = Array.from({ length: 26 }, (_, i) => ({ name: `Place ${i}`, geoQuery: `Place ${i}` }));
    const res = await run(geocodePlaces(many, KYOTO));
    expect(res.filter((r) => r.status === "not_found")).toHaveLength(24);
    expect(res.slice(24).map((r) => r.status)).toEqual(["unchecked", "unchecked"]);
  });

  it("stops at the deadline and leaves the rest unchecked", async () => {
    stubNominatim({});
    const { geocodePlaces } = await load();
    const res = await run(geocodePlaces(places, KYOTO, Date.now() + 1000));
    expect(res.map((r) => r.status)).toEqual(["unchecked", "unchecked"]);
  });

  it("doesn't overrun the deadline by queueing leftover places", async () => {
    stubNominatim({});
    const { geocodePlaces } = await load();
    const start = Date.now();
    const many = Array.from({ length: 12 }, (_, i) => ({ name: `Place ${i}`, geoQuery: `Place ${i}` }));
    const res = await run(geocodePlaces(many, KYOTO, start + 5_000));
    expect(Date.now() - start).toBeLessThanOrEqual(5_000);
    expect(res.filter((r) => r.status === "unchecked").length).toBeGreaterThan(0);
  });

  it("keeps concurrent requests in one instance at 1 call per 1.1s", async () => {
    const times: number[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        times.push(Date.now());
        return Response.json([]);
      })
    );
    const { geocodePlaces } = await load();
    const a = geocodePlaces([{ name: "A1", geoQuery: "A1" }, { name: "A2", geoQuery: "A2" }], KYOTO);
    const b = geocodePlaces([{ name: "B1", geoQuery: "B1" }, { name: "B2", geoQuery: "B2" }], KYOTO);
    await vi.runAllTimersAsync();
    await Promise.all([a, b]);
    expect(times).toHaveLength(4);
    for (let i = 1; i < times.length; i++) expect(times[i] - times[i - 1]).toBeGreaterThanOrEqual(1100);
  });

  it("caches results, and never caches a failed request", async () => {
    const ok = stubNominatim({ "Fushimi Inari Taisha": 1 });
    const { geocodePlaces } = await load();
    await run(geocodePlaces(places.slice(0, 1), KYOTO));
    await run(geocodePlaces(places.slice(0, 1), KYOTO));
    expect(ok).toHaveBeenCalledTimes(1); // second lookup came from the cache

    const down = stubNominatim({}, 503);
    const res = await run(geocodePlaces(places.slice(1), KYOTO));
    expect(res[0].status).toBe("unchecked");
    stubNominatim({ "Philosopher's Path": 2 });
    const retry = await run(geocodePlaces(places.slice(1), KYOTO));
    expect(retry[0].status).toBe("verified");
    expect(down).toHaveBeenCalled();
  });
});

describe("nameMatches", () => {
  it("ignores case, accents and punctuation", async () => {
    const { nameMatches } = await load();
    expect(nameMatches("Hanavsky Pavilon", ["Hanavský pavilon"])).toBe(true);
    expect(nameMatches("Owens Thomas House", ["Owens-Thomas House"])).toBe(true);
    expect(nameMatches("Beinhaus", ["St. Michaels Kapelle / Beinhaus"])).toBe(true);
    expect(nameMatches("哲学の道", ["哲学の道"])).toBe(true);
  });

  it("rejects a name that shares only some of the words", async () => {
    const { nameMatches } = await load();
    expect(nameMatches("Làng hoa Ngọc Hà", ["Nhà văn hóa làng Du Tràng"])).toBe(false);
    expect(nameMatches("Chợ Hàng Bè", ["Phố Hàng Bè"])).toBe(false); // the street, not the market
    expect(nameMatches("", ["anything"])).toBe(false);
  });
});

describe("geocodePlaces for repair", () => {
  const HANOI: Destination = {
    lat: 21.03,
    lng: 105.85,
    bbox: [20.9, 21.2, 105.7, 106.0],
    countryCode: "vn",
    displayName: "Hà Nội, Việt Nam",
  };
  const stub = (hits: Record<string, object>) =>
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const hit = hits[new URL(url).searchParams.get("q") ?? ""];
        return Response.json(hit ? [hit] : []);
      })
    );

  it("rejects a hit OSM knows by another name, which a first-pass lookup would accept", async () => {
    // Recorded 2026-10-03: the top hit for a Hanoi flower village.
    stub({
      "Làng hoa Ngọc Hà": { lat: "20.95", lon: "105.98", osm_type: "node", osm_id: 13188700558, name: "Nhà văn hóa làng Du Tràng" },
    });
    const { geocodePlaces } = await load();
    const asked = [{ name: "Làng hoa Ngọc Hà", geoQuery: "Làng hoa Ngọc Hà" }];
    expect((await run(geocodePlaces(asked, HANOI, undefined, { repair: true })))[0].status).toBe("not_found");
    expect((await run(geocodePlaces(asked, HANOI)))[0].status).toBe("verified");
  });

  it("accepts a hit when one of OSM's names matches, such as an alternative name", async () => {
    stub({
      "千本ゑんま堂": { lat: "35.04", lon: "135.74", osm_type: "node", osm_id: 2, name: "引接寺", namedetails: { name: "引接寺", alt_name: "千本ゑんま堂" } },
    });
    const { geocodePlaces } = await load();
    const res = await run(geocodePlaces([{ name: "千本ゑんま堂", geoQuery: "千本ゑんま堂" }], KYOTO, undefined, { repair: true }));
    expect(res[0].status).toBe("verified");
    expect(res[0].geo?.name).toBe("引接寺");
  });
});

describe("geocodeDestination", () => {
  it("returns the box and country code of the top hit", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json([
          {
            lat: "35.0116",
            lon: "135.7681",
            boundingbox: ["34.8", "35.3", "135.5", "135.9"],
            display_name: "Kyoto, Kyoto Prefecture, Japan",
            address: { country_code: "jp" },
          },
        ])
      )
    );
    const { geocodeDestination } = await load();
    expect(await run(geocodeDestination("Kyoto"))).toEqual(KYOTO);
  });

  it("separates 'no such place' (null) from 'lookup failed' (undefined)", async () => {
    stubNominatim({});
    const { geocodeDestination } = await load();
    expect(await run(geocodeDestination("Qwxzt Vrrnplk"))).toBeNull();
    stubNominatim({}, 500);
    expect(await run(geocodeDestination("Somewhere Else"))).toBeUndefined();
  });
});
