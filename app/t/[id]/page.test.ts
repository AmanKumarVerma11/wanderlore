import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase", () => ({ getItinerary: vi.fn() }));

import { generateMetadata } from "./page";
import { getItinerary } from "@/lib/supabase";
import type { Itinerary } from "@/lib/types";

// Next 16 passes route params as a Promise; reading `params.id` directly gives undefined.
const props = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("shared trip page metadata", () => {
  it("awaits the route params and links the trip by its id", async () => {
    vi.mocked(getItinerary).mockResolvedValue({
      destinationFull: "Lisbon, Portugal",
      heritageSummary: "Layers of Roman, Moorish and maritime history.",
    } as Itinerary);
    const meta = await generateMetadata(props("abc"));
    expect(getItinerary).toHaveBeenCalledWith("abc");
    expect(meta.alternates?.canonical).toBe("/t/abc");
    expect(meta.openGraph?.url).toBe("/t/abc");
  });

  it("titles an unknown trip as not found", async () => {
    vi.mocked(getItinerary).mockResolvedValue(null);
    const meta = await generateMetadata(props("missing"));
    expect(meta.title).toMatch(/not found/i);
  });
});
