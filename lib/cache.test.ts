import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cacheGet, cacheSet, clearMemoryCache } from "./cache";
import { kv, kvPipeline } from "./kv";

beforeEach(() => {
  clearMemoryCache();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function withKv(reply: (body: unknown, url: string) => unknown) {
  vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://kv.example");
  vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "token");
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) =>
    Response.json(reply(JSON.parse(String(init?.body)), url))
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("cache without a shared store", () => {
  it("serves values, including cached nulls, from memory", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await cacheSet("geo:a", { lat: 1 }, 60);
    await cacheSet("geo:missing", null, 60);
    expect(await cacheGet("geo:a")).toEqual({ lat: 1 });
    expect(await cacheGet("geo:missing")).toBeNull();
    expect(await cacheGet("geo:never-set")).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("evicts the oldest entry beyond 2000 keys", async () => {
    for (let i = 0; i <= 2000; i++) await cacheSet(`k${i}`, i, 60);
    expect(await cacheGet("k0")).toBeUndefined();
    expect(await cacheGet("k2000")).toBe(2000);
  });
});

describe("cache with the shared store", () => {
  it("reads through to the store once, then serves from memory", async () => {
    const fetchMock = withKv(() => ({ result: JSON.stringify({ lat: 2 }) }));
    expect(await cacheGet("geo:b")).toEqual({ lat: 2 });
    expect(await cacheGet("geo:b")).toEqual({ lat: 2 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual(["GET", "geo:b"]);
  });

  it("writes JSON with an expiry", async () => {
    const fetchMock = withKv(() => ({ result: "OK" }));
    await cacheSet("geo:c", null, 3600);
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual(["SET", "geo:c", "null", "EX", 3600]);
  });

  it("treats store errors and outages as a miss", async () => {
    withKv(() => ({ error: "ERR boom" }));
    expect(await kv(["GET", "x"])).toBeUndefined();
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network down"); }));
    expect(await cacheGet("geo:d")).toBeUndefined();
  });

  it("sends pipelines to /pipeline", async () => {
    const fetchMock = withKv((_body, url) => (url.endsWith("/pipeline") ? [{ result: "OK" }, { result: 3 }] : {}));
    expect(await kvPipeline([["SET", "n", 0, "NX"], ["INCR", "n"]])).toEqual(["OK", 3]);
    expect(fetchMock.mock.calls[0][0]).toBe("https://kv.example/pipeline");
  });
});
