import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { checkPlanLimits, memoryLimitEntries, resetMemoryLimits } from "./ratelimit";

beforeEach(() => {
  resetMemoryLimits();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("checkPlanLimits (no shared store)", () => {
  const at = new Date("2026-10-03T10:15:00Z");

  it("allows 5 plans per IP per hour, then asks to retry at the next hour", async () => {
    for (let i = 0; i < 5; i++) expect((await checkPlanLimits("1.2.3.4", at)).ok).toBe(true);
    const sixth = await checkPlanLimits("1.2.3.4", at);
    expect(sixth).toEqual({ ok: false, reason: "ip", retryAfterSec: 45 * 60 });
    expect((await checkPlanLimits("5.6.7.8", at)).ok).toBe(true); // other IPs unaffected
  });

  it("forgets expired windows instead of growing forever", async () => {
    for (let i = 0; i < 1001; i++) await checkPlanLimits(`10.0.${Math.floor(i / 256)}.${i % 256}`, at);
    expect(memoryLimitEntries()).toBe(1002); // 1001 IP windows + the day counter
    // Two hours later. No fake timers: the limiter must use the clock it is given,
    // or this result would depend on when the test runs.
    await checkPlanLimits("9.9.9.9", new Date("2026-10-03T12:00:00Z"));
    expect(memoryLimitEntries()).toBe(2); // the day counter + the new IP window
  });

  it("starts a fresh window the next hour", async () => {
    for (let i = 0; i < 6; i++) await checkPlanLimits("1.2.3.4", at);
    expect((await checkPlanLimits("1.2.3.4", new Date("2026-10-03T11:00:01Z"))).ok).toBe(true);
  });
});

describe("checkPlanLimits (shared store)", () => {
  it("counts in the store with SET NX + INCR, and enforces the daily cap", async () => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://kv.example");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "token");
    const bodies: unknown[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        const cmds = JSON.parse(String(init?.body)) as string[][];
        bodies.push(cmds);
        const isDaily = String(cmds[1][1]).startsWith("rl:day:");
        return Response.json([{ result: "OK" }, { result: isDaily ? 351 : 1 }]);
      })
    );
    // 03:15 UTC on Oct 3 is still Oct 2 in California.
    const res = await checkPlanLimits("1.2.3.4", new Date("2026-10-03T03:15:00Z"));
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("daily");
    expect(bodies[1]).toEqual([
      ["SET", "rl:day:2026-10-02", 0, "EX", 172800, "NX"],
      ["INCR", "rl:day:2026-10-02"],
    ]);
  });
});
