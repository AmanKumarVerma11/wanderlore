import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/plan", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/plan")>()),
  planTrip: vi.fn(),
}));
vi.mock("@/lib/ratelimit", () => ({ checkPlanLimits: vi.fn(async () => ({ ok: true })) }));
vi.mock("@/lib/supabase", () => ({ isSupabaseEnabled: () => false }));

import { POST } from "./route";
import { planTrip, PlanError } from "@/lib/plan";
import { checkPlanLimits } from "@/lib/ratelimit";

const BODY = { destination: "Kyoto", interests: ["Heritage & history"], days: 2, pace: "balanced" };
const post = (body: unknown, headers: Record<string, string> = {}) =>
  POST(new Request("http://localhost/api/plan", { method: "POST", body: JSON.stringify(body), headers }));

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/plan", () => {
  it("declines EEA, Swiss and UK visitors before planning", async () => {
    const res = await post(BODY, { "x-vercel-ip-country": "DE" });
    expect(res.status).toBe(451);
    expect(planTrip).not.toHaveBeenCalled();
  });

  it("returns the pipeline's status and message for a known failure", async () => {
    vi.mocked(planTrip).mockRejectedValue(new PlanError("We couldn't find that destination on the map.", 422));
    const res = await post(BODY);
    expect(res.status).toBe(422);
    expect((await res.json()).error).toMatch(/couldn't find/);
  });

  it("rate-limits in production, with Retry-After, before planning", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.mocked(checkPlanLimits).mockResolvedValue({ ok: false, reason: "ip", retryAfterSec: 1200 });
    const res = await post(BODY, { "x-forwarded-for": "1.2.3.4, 10.0.0.1" });
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("1200");
    expect(checkPlanLimits).toHaveBeenCalledWith("1.2.3.4");
    expect(planTrip).not.toHaveBeenCalled();
  });

  it("returns the plan with how it was made", async () => {
    const trace = { totalMs: 21_000, spans: [{ name: "gemini", start: 900, ms: 9_000, outcome: "200" }] };
    vi.mocked(planTrip).mockResolvedValue({
      itinerary: { destinationFull: "Kyoto, Japan" },
      meta: { mode: "single" },
      trace,
    } as unknown as Awaited<ReturnType<typeof planTrip>>);
    const res = await post(BODY);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.itinerary.destinationFull).toBe("Kyoto, Japan");
    expect(data.trace).toEqual(trace);
    expect(data.shareEnabled).toBe(false);
  });

  it("rejects invalid input with 400", async () => {
    const res = await post({ ...BODY, days: 30 });
    expect(res.status).toBe(400);
    expect(planTrip).not.toHaveBeenCalled();
  });
});
