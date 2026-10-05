import { describe, it, expect, vi, beforeEach } from "vitest";

// Supabase is mocked: these tests must never write to a real database.
vi.mock("@/lib/supabase", () => ({
  isSupabaseEnabled: vi.fn(() => true),
  saveItinerary: vi.fn(async () => "trip-id"),
}));

import { POST } from "./route";
import { saveItinerary } from "@/lib/supabase";

const itinerary = (osmUrl: string) => ({
  destinationFull: "Kyoto, Japan",
  days: [{ day: 1, theme: "t", items: [{ name: "Fushimi Inari", verified: true, osmUrl }] }],
  localSecrets: [],
  hero: null,
  sources: [],
});

const post = (body: string) =>
  POST(new Request("http://localhost/api/save", { method: "POST", body }));

beforeEach(() => {
  vi.mocked(saveItinerary).mockClear();
});

describe("POST /api/save", () => {
  it("saves a well-formed itinerary", async () => {
    const res = await post(JSON.stringify({ itinerary: itinerary("https://www.openstreetmap.org/node/1") }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: "trip-id" });
    expect(saveItinerary).toHaveBeenCalledTimes(1);
  });

  it("rejects a javascript: URL without touching the database", async () => {
    const res = await post(JSON.stringify({ itinerary: itinerary("javascript:alert(1)") }));
    expect(res.status).toBe(400);
    expect(saveItinerary).not.toHaveBeenCalled();
  });

  it("rejects oversized and malformed bodies without touching the database", async () => {
    expect((await post("x".repeat(200_001))).status).toBe(413);
    expect((await post("{not json")).status).toBe(400);
    expect(saveItinerary).not.toHaveBeenCalled();
  });
});
