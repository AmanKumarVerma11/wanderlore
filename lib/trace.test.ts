import { describe, it, expect, vi, afterEach } from "vitest";
import { startSpan, withTrace } from "./trace";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

afterEach(() => {
  vi.useRealTimers();
});

describe("withTrace", () => {
  it("records timed spans from parallel branches, in start order", async () => {
    vi.useFakeTimers();
    const run = withTrace(async () => {
      const dest = startSpan("destination", "Kyoto");
      await wait(900);
      dest("found");
      await Promise.all([
        (async () => {
          const gen = startSpan("gemini", "gemini-3.5-flash-lite");
          await wait(9000);
          gen("200");
        })(),
        (async () => {
          await wait(10);
          const wiki = startSpan("wikipedia", "Kyoto");
          await wait(500);
          wiki("found", { cached: true });
        })(),
      ]);
      return "plan";
    });
    await vi.runAllTimersAsync();
    const { value, trace } = await run;

    expect(value).toBe("plan");
    expect(trace.spans).toEqual([
      { name: "destination", start: 0, ms: 900, outcome: "found", detail: "Kyoto" },
      { name: "gemini", start: 900, ms: 9000, outcome: "200", detail: "gemini-3.5-flash-lite" },
      { name: "wikipedia", start: 910, ms: 500, outcome: "found", detail: "Kyoto", cached: true },
    ]);
    expect(trace.totalMs).toBe(9900);
  });

  it("keeps the spans of concurrent requests apart", async () => {
    const one = withTrace(async () => {
      await wait(5);
      startSpan("lookup", "A")("found");
    });
    const two = withTrace(async () => {
      startSpan("lookup", "B")("not found");
      await wait(5);
    });
    const [a, b] = await Promise.all([one, two]);
    expect(a.trace.spans.map((s) => s.detail)).toEqual(["A"]);
    expect(b.trace.spans.map((s) => s.detail)).toEqual(["B"]);
  });

  it("does nothing outside a traced request", () => {
    expect(() => startSpan("lookup", "x")("found")).not.toThrow();
  });
});
