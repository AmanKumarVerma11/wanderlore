import type { ModelItinerary, PlanRequest } from "./types";

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

export function buildPrompt(req: PlanRequest): string {
  const itemsPerDay =
    req.pace === "relaxed" ? "2-3" : req.pace === "packed" ? "4-5" : "3-4";
  return [
    "You are a knowledgeable local cultural guide and storyteller. Craft a rich,",
    "authentic cultural discovery plan for a traveller. Prioritise meaningful,",
    "respectful engagement with local culture over generic tourist checklists.",
    "",
    "Traveller brief:",
    `- Destination: ${req.destination}`,
    `- Interests: ${req.interests.join(", ")}`,
    `- Trip length: ${req.days} day(s)`,
    `- Pace: ${req.pace} (about ${itemsPerDay} places per day)`,
    req.note ? `- Notes: ${req.note}` : "- Notes: none",
    "",
    "Produce:",
    "1. destinationFull: the destination as 'City, Country' (resolve informal names).",
    "2. story: 2-3 vivid paragraphs telling the cultural soul and history of the",
    "   place — immersive storytelling that makes the reader feel its atmosphere.",
    "3. heritageSummary: 2-4 sentences on the heritage that defines it (traditions,",
    "   UNESCO sites, crafts, cuisine) and why it matters.",
    "4. days: one entry per day with a theme and a mix of items. Each item is a real,",
    "   verifiable place. Mark famous sites as type 'attraction' and lesser-known,",
    "   locally-loved spots as type 'gem'. Include at least one 'gem' most days.",
    "   For geoQuery give ONE specific, mappable place as 'Place, City, Country'",
    "   (a single named site — never a list, range, or 'A and B'; pick the main one).",
    "5. localSecrets: 3-5 extra hidden gems (type 'gem') a typical tourist misses.",
    "6. events: 3-5 established, recurring cultural events/festivals. For whenTypical",
    "   give the usual season or month (e.g. 'Mid-July, annually') — never invent an",
    "   exact date. Only include events you are confident genuinely recur there.",
    "7. experiences: 3-5 authentic, participatory cultural experiences (workshops,",
    "   ceremonies, shared meals) with how to engage and a respectful tip.",
    "8. phrases: 4-6 useful local-language phrases with meanings.",
    "9. etiquette: 4-6 concise cultural etiquette / respect tips.",
    "",
    "Be accurate. Only name places and events that genuinely exist. If unsure a",
    "place is real, omit it. Return ONLY JSON matching the provided schema.",
  ].join("\n");
}

export class GeminiError extends Error {
  status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.name = "GeminiError";
    this.status = status;
  }
}

export async function generateItinerary(
  req: PlanRequest
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
    contents: [{ role: "user", parts: [{ text: buildPrompt(req) }] }],
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

interface GeminiApiResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
  }>;
  promptFeedback?: { blockReason?: string };
}
