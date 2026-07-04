import type { ModelItinerary, PlanRequest } from "./types";
import { buildPrompt } from "./prompts";

// Re-export so existing callers/tests importing buildPrompt from here keep working.
export { buildPrompt } from "./prompts";

/**
 * Real Google Gemini call (no mocks, no canned output).
 *
 * We hit the REST `generateContent` endpoint with a strict `responseSchema` so
 * the model returns machine-readable JSON that maps onto `ModelItinerary`. The
 * key is read from a server-only env var and never reaches the client.
 *
 * Note: Google Search grounding is deliberately NOT used here — it requires a
 * billed key. Instead the server verifies every place the model names against
 * OpenStreetMap and enriches heritage with Wikipedia (see lib/geocode, lib/wiki).
 */

const MODEL = process.env.GEMINI_MODEL || "gemini-flash-latest";

const placeSchema = {
  type: "object",
  properties: {
    name: { type: "string" },
    type: { type: "string", enum: ["attraction", "gem"] },
    blurb: { type: "string" },
    significance: { type: "string" },
    bestTime: { type: "string" },
    geoQuery: { type: "string" },
  },
  required: ["name", "type", "blurb", "significance", "bestTime", "geoQuery"],
} as const;

const responseSchema = {
  type: "object",
  properties: {
    destinationFull: { type: "string" },
    story: { type: "string" },
    heritageSummary: { type: "string" },
    days: {
      type: "array",
      items: {
        type: "object",
        properties: {
          day: { type: "number" },
          theme: { type: "string" },
          items: { type: "array", items: placeSchema },
        },
        required: ["day", "theme", "items"],
      },
    },
    localSecrets: { type: "array", items: placeSchema },
    events: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          whenTypical: { type: "string" },
          description: { type: "string" },
          culturalRoot: { type: "string" },
        },
        required: ["name", "whenTypical", "description", "culturalRoot"],
      },
    },
    experiences: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          description: { type: "string" },
          howToEngage: { type: "string" },
          respectfulTip: { type: "string" },
        },
        required: ["title", "description", "howToEngage", "respectfulTip"],
      },
    },
    phrases: {
      type: "array",
      items: {
        type: "object",
        properties: {
          phrase: { type: "string" },
          meaning: { type: "string" },
        },
        required: ["phrase", "meaning"],
      },
    },
    etiquette: { type: "array", items: { type: "string" } },
  },
  required: [
    "destinationFull",
    "story",
    "heritageSummary",
    "days",
    "localSecrets",
    "events",
    "experiences",
    "phrases",
    "etiquette",
  ],
} as const;

export class GeminiError extends Error {
  status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.name = "GeminiError";
    this.status = status;
  }
}

/**
 * Core Gemini structured call: send an arbitrary prompt, get strict
 * `ModelItinerary` JSON back (enforced by `responseSchema`). Shared by the
 * single-model plan and by ensemble synthesis (lib/orchestrator.ts).
 */
export async function geminiStructured(
  promptText: string
): Promise<ModelItinerary> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new GeminiError(
      "Server is missing GEMINI_API_KEY. Set it as an environment variable.",
      500
    );
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

  const body = {
    contents: [{ role: "user", parts: [{ text: promptText }] }],
    generationConfig: {
      temperature: 0.8,
      responseMimeType: "application/json",
      responseSchema,
      // Disable "thinking": much lower latency (avoids serverless timeouts) and
      // materially cheaper, which is plenty for this structured task.
      thinkingConfig: { thinkingBudget: 0 },
    },
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    throw new GeminiError(
      err instanceof Error && err.name === "AbortError"
        ? "The guide took too long to respond. Please try again."
        : "Could not reach the model service.",
      504
    );
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new GeminiError(
      `Model request failed (${res.status}). ${detail.slice(0, 300)}`,
      502
    );
  }

  const data = (await res.json()) as GeminiApiResponse;
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    const blockReason = data?.promptFeedback?.blockReason;
    throw new GeminiError(
      blockReason
        ? `The request was blocked by the model (${blockReason}). Try rephrasing your notes.`
        : "The model returned an empty response.",
      502
    );
  }

  try {
    return JSON.parse(text) as ModelItinerary;
  } catch {
    throw new GeminiError("The model returned malformed JSON.", 502);
  }
}

/** Single-model itinerary (phase 1 path; also the ensemble's terminal fallback). */
export function generateItinerary(req: PlanRequest): Promise<ModelItinerary> {
  return geminiStructured(buildPrompt(req));
}

interface GeminiApiResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
  }>;
  promptFeedback?: { blockReason?: string };
}
