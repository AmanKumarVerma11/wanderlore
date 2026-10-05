// Fault injection across the whole request: the real pipeline (destination check,
// generation, place checks, repair, Wikipedia) against a fake network where any
// service can stall, slow down or fail. Fake timers make each run instant. Every
// test checks the 55s budget holds and that place statuses stay honest.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ModelItinerary, PlanRequest } from "./types";

const REQ: PlanRequest = { destination: "Kyoto", interests: ["Heritage & history"], days: 1, pace: "balanced" };
const BUDGET = 55_000;

const place = (name: string, type: "attraction" | "gem" = "attraction") => ({
  name,
  type,
  blurb: `About ${name}.`,
  significance: "s",
  bestTime: "t",
  geoQuery: `${name}, Kyoto, Japan`,
});
const PLAN: ModelItinerary = {
  destinationFull: "Kyoto, Japan",
  story: "A story.",
  heritageSummary: "Heritage.",
  days: [{ day: 1, theme: "Temples", items: [place("Kinkaku-ji"), place("Honno-ji Temple"), place("Aburahaya", "gem")] }],
  localSecrets: [place("Nishiki Market", "gem")],
  events: [],
  experiences: [],
  phrases: [],
  etiquette: [],
};
// OSM knows these names inside Kyoto; Honno-ji only under its Japanese name.
const ON_OSM = new Set(["Kinkaku-ji", "Nishiki Market", "本能寺"]);

interface Reply {
  status?: number; // anything but 200 is an error response
  delayMs?: number;
  hang?: boolean; // never answers; only the caller's timeout ends it
}
interface World {
  nominatim: (q: string) => Reply;
  gemini: (model: string, kind: "plan" | "repair") => Reply;
  wiki: () => Reply;
  plan?: ModelItinerary; // what the model writes, PLAN by default
}
const healthy: World = { nominatim: () => ({}), gemini: () => ({}), wiki: () => ({}) };

function body(world: World, url: URL, init?: RequestInit): unknown {
  if (url.host.includes("nominatim")) {
    const q = url.searchParams.get("q") ?? "";
    if (q === "Kyoto") {
      return [{
        lat: "35.0116", lon: "135.7681", boundingbox: ["34.8", "35.3", "135.5", "135.9"],
        display_name: "Kyoto, Kyoto Prefecture, Japan", address: { country_code: "jp" },
      }];
    }
    return ON_OSM.has(q) ? [{ lat: "35.0", lon: "135.7", osm_type: "node", osm_id: 1, name: q }] : [];
  }
  if (url.host.includes("generativelanguage")) {
    const isRepair = String(init?.body).includes('"osmName"');
    const value = isRepair
      ? { places: [{ id: 1, osmName: "本能寺" }, { id: 2, osmName: null }] }
      : world.plan ?? PLAN;
    return { candidates: [{ content: { parts: [{ text: JSON.stringify(value) }] } }] };
  }
  if (url.host.includes("commons")) {
    return { query: { pages: [{ imageinfo: [{ extmetadata: { Artist: { value: "A" }, LicenseShortName: { value: "CC BY 2.0" } } }] }] } };
  }
  return {
    type: "standard", title: "Kyoto", extract: "Kyoto is a city.",
    thumbnail: { source: "https://upload.wikimedia.org/wikipedia/commons/a/ab/Kyoto.jpg" },
    content_urls: { desktop: { page: "https://en.wikipedia.org/wiki/Kyoto" } },
  };
}

function install(world: World) {
  const fetchMock = vi.fn((input: string, init?: RequestInit) => {
    const url = new URL(input);
    let reply: Reply;
    if (url.host.includes("nominatim")) reply = world.nominatim(url.searchParams.get("q") ?? "");
    else if (url.host.includes("generativelanguage")) {
      const model = url.pathname.split("/models/")[1].split(":")[0];
      reply = world.gemini(model, String(init?.body).includes('"osmName"') ? "repair" : "plan");
    } else reply = world.wiki();

    return new Promise<Response>((resolve, reject) => {
      const signal = init?.signal;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const abort = () => {
        clearTimeout(timer);
        reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
      };
      if (signal?.aborted) return abort();
      signal?.addEventListener("abort", abort);
      if (reply.hang) return;
      timer = setTimeout(() => {
        signal?.removeEventListener("abort", abort);
        resolve(
          reply.status && reply.status !== 200
            ? new Response("unavailable", { status: reply.status })
            : Response.json(body(world, url, init))
        );
      }, reply.delayMs ?? 0);
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** Run planTrip on fresh modules and fast-forward fake time until it settles. */
async function plan(world: World) {
  const fetchMock = install(world);
  vi.resetModules();
  const { planTrip } = await import("./plan");
  const start = Date.now();
  // Time is read when the request settles, not after every leftover timer has run.
  const run = planTrip(REQ, start + BUDGET).then(
    (value) => ({ value, error: undefined, elapsed: Date.now() - start }),
    (error) => ({ value: undefined, error, elapsed: Date.now() - start })
  );
  await vi.runAllTimersAsync();
  return { ...(await run), fetchMock };
}

const statuses = (it: { days: Array<{ items: Array<{ name: string; geoStatus?: string }> }>; localSecrets: Array<{ name: string; geoStatus?: string }> }) =>
  Object.fromEntries([...it.days.flatMap((d) => d.items), ...it.localSecrets].map((p) => [p.name, p.geoStatus]));

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv("GEMINI_API_KEY", "test-key");
  vi.stubEnv("GEMINI_MODEL", "primary-flash-lite");
  vi.stubEnv("GEMINI_FALLBACK_MODEL", "fallback-flash-lite");
  vi.stubEnv("GEMINI_REPAIR_MODEL", "repair-flash-lite");
  vi.stubEnv("NVIDIA_API_KEY", "");
  vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
  vi.stubEnv("KV_REST_API_URL", "");
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("the whole request under faults", () => {
  it("healthy: checks every place, repairs a local name, and traces each stage", async () => {
    const { value, elapsed } = await plan(healthy);
    expect(elapsed).toBeLessThan(BUDGET);
    expect(statuses(value!.itinerary)).toEqual({
      "Kinkaku-ji": "verified",
      "Honno-ji Temple": "verified",
      Aburahaya: "not_found",
      "Nishiki Market": "verified",
    });
    expect(value!.itinerary.days[0].items[1].osmName).toBe("本能寺");
    expect(new Set(value!.trace.spans.map((s) => s.name))).toEqual(
      new Set(["destination", "gemini", "lookup", "repair", "repair-lookup", "wikipedia", "photo-credit"])
    );
  });

  it("a hung primary model: the fallback still writes the plan, and places still get checked", async () => {
    const { value, elapsed } = await plan({
      ...healthy,
      gemini: (model) => (model === "primary-flash-lite" ? { hang: true } : {}),
    });
    expect(elapsed).toBeLessThan(BUDGET);
    expect(value!.trace.spans.filter((s) => s.name === "gemini").map((s) => s.outcome)).toEqual(["timeout", "200"]);
    expect(Object.values(statuses(value!.itinerary))).not.toContain("unchecked");
  });

  it("both models down: a plain 'busy' error well inside the budget", async () => {
    const { error, elapsed } = await plan({ ...healthy, gemini: (_m, kind) => (kind === "plan" ? { status: 503 } : {}) });
    expect(error.status).toBe(503);
    expect(error.message).toMatch(/busy/);
    expect(elapsed).toBeLessThan(5_000);
  });

  it("the destination lookup fails: 503 before any model call", async () => {
    const { error, fetchMock } = await plan({ ...healthy, nominatim: () => ({ status: 503 }) });
    expect(error.status).toBe(503);
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("generativelanguage"))).toBe(false);
  });

  it("the map fails after the destination: the plan arrives, places 'not checked', never 'not found'", async () => {
    const { value } = await plan({ ...healthy, nominatim: (q) => (q === "Kyoto" ? {} : { status: 503 }) });
    expect(new Set(Object.values(statuses(value!.itinerary)))).toEqual(new Set(["unchecked"]));
    expect(value!.trace.spans.some((s) => s.name === "repair")).toBe(false); // nothing was "not found"
  });

  it("a very slow map: stops at the budget, even mid-request, and says which places weren't checked", async () => {
    const ten = Array.from({ length: 10 }, (_, i) => place(`Place ${i}`));
    const { value, elapsed } = await plan({
      ...healthy,
      plan: { ...PLAN, days: [{ day: 1, theme: "Many", items: ten }], localSecrets: [] },
      nominatim: (q) => (q === "Kyoto" ? {} : { delayMs: 7_400 }), // under the 8s request timeout
    });
    expect(elapsed).toBeLessThanOrEqual(BUDGET);
    const counts = Object.values(statuses(value!.itinerary));
    expect(counts).toContain("not_found");
    expect(counts).toContain("unchecked");
  });

  it("Wikipedia hangs: the plan arrives on time, without sources", async () => {
    const { value, elapsed } = await plan({ ...healthy, wiki: () => ({ hang: true }) });
    expect(elapsed).toBeLessThan(BUDGET);
    expect(value!.itinerary.hero).toBeNull();
    expect(value!.itinerary.days[0].items[0].geoStatus).toBe("verified");
  });

  it("the repair model stalls: the next one answers, within the budget", async () => {
    const { value, elapsed } = await plan({
      ...healthy,
      gemini: (model, kind) => (kind === "repair" && model === "repair-flash-lite" ? { hang: true } : {}),
    });
    expect(elapsed).toBeLessThan(BUDGET);
    expect(value!.trace.spans.filter((s) => s.name === "repair").map((s) => [s.detail, s.outcome])).toEqual([
      ["repair-flash-lite", "timeout"],
      ["gemini-3.5-flash-lite", "200"],
    ]);
    expect(statuses(value!.itinerary)["Honno-ji Temple"]).toBe("verified");
  });

  it("every repair model is down: the first pass's statuses stand", async () => {
    const { value } = await plan({ ...healthy, gemini: (_m, kind) => (kind === "repair" ? { status: 503 } : {}) });
    expect(statuses(value!.itinerary)["Honno-ji Temple"]).toBe("not_found");
    expect(value!.trace.spans.find((s) => s.name === "repair")?.outcome).toBe("503");
  });
});
