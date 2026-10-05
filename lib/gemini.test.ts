import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const PLAN = { destinationFull: "Kyoto, Japan" };

// Reply per model name in the URL: a status, or 200 with a valid plan.
function stubGemini(replies: Record<string, number>) {
  const fetchMock = vi.fn(async (url: string) => {
    const model = url.split("/models/")[1].split(":")[0];
    const status = replies[model] ?? 500;
    if (status !== 200) return new Response('{"error":{"message":"upstream detail"}}', { status });
    return Response.json({
      candidates: [{ content: { parts: [{ text: JSON.stringify(PLAN) }] } }],
      modelVersion: `${model}-v`,
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function load() {
  vi.resetModules();
  return import("./gemini");
}

beforeEach(() => {
  vi.stubEnv("GEMINI_API_KEY", "test-key");
  vi.stubEnv("GEMINI_MODEL", "gemini-primary-flash");
  vi.stubEnv("GEMINI_FALLBACK_MODEL", "gemini-backup-flash-lite");
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("geminiStructured model chain", () => {
  it("uses the primary model when it answers", async () => {
    const fetchMock = stubGemini({ "gemini-primary-flash": 200 });
    const { geminiStructured } = await load();
    const gen = await geminiStructured("prompt");
    expect(gen.itinerary).toEqual(PLAN);
    expect(gen.model).toBe("gemini-primary-flash-v");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("asks for noteFit right after the destination, before any place", async () => {
    const fetchMock = stubGemini({ "gemini-primary-flash": 200 });
    const { geminiStructured } = await load();
    await geminiStructured("prompt");
    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    const schema = body.generationConfig.responseSchema;
    // Gemini writes fields in schema order, so this order is what makes it commit first.
    expect(Object.keys(schema.properties).slice(0, 3)).toEqual(["destinationFull", "noteFit", "story"]);
    expect(schema.required).toContain("noteFit");
  });

  it("falls back to the second model when the primary is overloaded", async () => {
    stubGemini({ "gemini-primary-flash": 503, "gemini-backup-flash-lite": 200 });
    const { geminiStructured } = await load();
    const gen = await geminiStructured("prompt");
    expect(gen.model).toBe("gemini-backup-flash-lite-v");
    expect(gen.attempts.map((a) => a.status)).toEqual([503, 200]);
  });

  it("reports a friendly busy error, without upstream text, when both fail", async () => {
    stubGemini({ "gemini-primary-flash": 503, "gemini-backup-flash-lite": 429 });
    const { geminiStructured, GeminiError } = await load();
    const err = await geminiStructured("prompt").catch((e) => e);
    expect(err).toBeInstanceOf(GeminiError);
    expect(err.status).toBe(503);
    expect(err.message).toMatch(/busy/);
    expect(err.message).not.toMatch(/upstream detail/);
    expect(err.attempts).toHaveLength(2);
  });

  it("falls back when the primary sends a broken body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.includes("gemini-primary-flash")
          ? new Response('{"candidates": [', { status: 200 })
          : Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify(PLAN) }] } }] })
      )
    );
    const { geminiStructured } = await load();
    const gen = await geminiStructured("prompt");
    expect(gen.attempts.map((a) => a.status)).toEqual(["bad-json", 200]);
  });

  it("does not try the fallback when the key is rejected", async () => {
    const fetchMock = stubGemini({ "gemini-primary-flash": 401 });
    const { geminiStructured } = await load();
    await expect(geminiStructured("prompt")).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("cuts off a hung primary in time for the fallback to answer", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string, init: RequestInit) =>
        url.includes("gemini-primary-flash")
          ? new Promise((_, reject) =>
              init.signal?.addEventListener("abort", () =>
                reject(Object.assign(new Error("aborted"), { name: "AbortError" }))
              )
            )
          : Promise.resolve(Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify(PLAN) }] } }] }))
      )
    );
    const { geminiStructured } = await load();
    const start = Date.now();
    const run = geminiStructured("prompt", start + 55_000);
    await vi.runAllTimersAsync();
    const gen = await run;
    expect(gen.attempts.map((a) => a.status)).toEqual(["timeout", 200]);
    // 55s, minus 23s kept for grounding and one 12s attempt kept for the fallback.
    expect(gen.attempts[0].ms).toBe(20_000);
    expect(Date.now() - start).toBeLessThanOrEqual(55_000 - 23_000);
  });

  it("does not start a request that cannot finish before the deadline", async () => {
    const fetchMock = stubGemini({ "gemini-primary-flash": 200 });
    const { geminiStructured } = await load();
    const err = await geminiStructured("prompt", Date.now() + 5_000).catch((e) => e);
    expect(err.status).toBe(504);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("thinkingConfig", () => {
  it("uses the setting each model accepts", async () => {
    const { thinkingConfig } = await load();
    expect(thinkingConfig("gemini-3.5-flash-lite")).toEqual({ thinkingLevel: "minimal" });
    expect(thinkingConfig("gemini-3.8-flash")).toEqual({ thinkingBudget: 0 });
  });
});
