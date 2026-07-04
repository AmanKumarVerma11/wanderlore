import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ModelItinerary, PlanRequest } from "./types";

// Mock the two model providers and the prompt builders so we can exercise the
// orchestration logic (fan-out, quorum, fallback ladder) without any network.
vi.mock("./nvidia", () => ({
  isNvidiaEnabled: vi.fn(),
  nvidiaChat: vi.fn(),
}));
vi.mock("./gemini", () => ({
  geminiStructured: vi.fn(),
  generateItinerary: vi.fn(),
}));
vi.mock("./prompts", () => ({
  buildPanelistPrompt: () => "panelist prompt",
  buildSynthesisPrompt: () => "synthesis prompt",
}));

import { generateItineraryEnsemble } from "./orchestrator";
import { isNvidiaEnabled, nvidiaChat } from "./nvidia";
import { geminiStructured, generateItinerary } from "./gemini";

const REQ: PlanRequest = {
  destination: "Kyoto",
  interests: ["Heritage & history"],
  days: 3,
  pace: "balanced",
};
const ENSEMBLE = { destinationFull: "Kyoto, Japan (ensemble)" } as ModelItinerary;
const SINGLE = { destinationFull: "Kyoto, Japan (single)" } as ModelItinerary;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(geminiStructured).mockResolvedValue(ENSEMBLE);
  vi.mocked(generateItinerary).mockResolvedValue(SINGLE);
});

describe("generateItineraryEnsemble", () => {
  it("runs the single-Gemini path when NVIDIA is not configured", async () => {
    vi.mocked(isNvidiaEnabled).mockReturnValue(false);

    const { model, meta } = await generateItineraryEnsemble(REQ);

    expect(model).toBe(SINGLE);
    expect(meta.mode).toBe("single");
    expect(meta.degraded).toBe(false);
    expect(nvidiaChat).not.toHaveBeenCalled();
  });

  it("synthesizes with Gemini when the full panel responds", async () => {
    vi.mocked(isNvidiaEnabled).mockReturnValue(true);
    vi.mocked(nvidiaChat).mockResolvedValue("a candidate draft");

    const { model, meta } = await generateItineraryEnsemble(REQ);

    expect(model).toBe(ENSEMBLE);
    expect(meta.mode).toBe("ensemble");
    expect(meta.panelistsUsed).toBe(2); // default panel = 2 fast models
    expect(meta.degraded).toBe(false);
    expect(geminiStructured).toHaveBeenCalledTimes(1);
    expect(generateItinerary).not.toHaveBeenCalled();
  });

  it("still synthesizes but marks degraded when some panelists fail", async () => {
    vi.mocked(isNvidiaEnabled).mockReturnValue(true);
    vi.mocked(nvidiaChat)
      .mockResolvedValueOnce("only surviving draft")
      .mockRejectedValueOnce(new Error("429"))
      .mockRejectedValueOnce(new Error("timeout"));

    const { model, meta } = await generateItineraryEnsemble(REQ);

    expect(model).toBe(ENSEMBLE);
    expect(meta.mode).toBe("ensemble");
    expect(meta.panelistsUsed).toBe(1);
    expect(meta.degraded).toBe(true);
  });

  it("falls back to single Gemini when the whole panel fails", async () => {
    vi.mocked(isNvidiaEnabled).mockReturnValue(true);
    vi.mocked(nvidiaChat).mockRejectedValue(new Error("NVIDIA down"));

    const { model, meta } = await generateItineraryEnsemble(REQ);

    expect(model).toBe(SINGLE);
    expect(meta.mode).toBe("single");
    expect(meta.degraded).toBe(true);
    expect(meta.panelistsUsed).toBe(0);
    expect(generateItinerary).toHaveBeenCalledTimes(1);
  });

  it("falls back to single Gemini when synthesis throws", async () => {
    vi.mocked(isNvidiaEnabled).mockReturnValue(true);
    vi.mocked(nvidiaChat).mockResolvedValue("a candidate draft");
    vi.mocked(geminiStructured).mockRejectedValue(new Error("synth failed"));

    const { model, meta } = await generateItineraryEnsemble(REQ);

    expect(model).toBe(SINGLE);
    expect(meta.mode).toBe("single");
    expect(meta.degraded).toBe(true);
    expect(generateItinerary).toHaveBeenCalledTimes(1);
  });
});
