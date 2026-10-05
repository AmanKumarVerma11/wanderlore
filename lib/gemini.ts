import type { GenerationAttempt, ModelItinerary, PlanRequest, SpanName } from "./types";
import { buildPrompt } from "./prompts";
import { startSpan } from "./trace";

// Re-export so existing callers/tests importing buildPrompt from here keep working.
export { buildPrompt } from "./prompts";

/**
 * Real Google Gemini call (no mocks, no canned output).
 *
 * We hit the REST `generateContent` endpoint with a strict `responseSchema` so
 * the model returns machine-readable JSON that maps onto `ModelItinerary`. The
 * key is read from a server-only env var and never reaches the client.
 *
 * Note: Google Search grounding is deliberately NOT used here: on the free tier
 * it isn't available for the Gemini 3 models. Instead the server verifies every
 * place the model names against OpenStreetMap and enriches heritage with
 * Wikipedia (see lib/geocode, lib/wiki).
 */

// A primary model and a fallback with its own free-tier quota bucket (500
// requests/day each on this project). Measured 2026-10-03 on 5 real trips:
// gemini-3.5-flash-lite answered 5/5 with 9-15s generation; gemini-3.8-flash
// (what gemini-flash-latest points to) answered 2/9, the rest 503 "high demand";
// gemini-3.5-flash answered 3/5 with 30-44s generation. Pinned versions, not the
// alias, which Google repoints with each release.
export const PRIMARY_MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";
export const FALLBACK_MODEL = process.env.GEMINI_FALLBACK_MODEL || "gemini-3.1-flash-lite";

// Thinking off, for latency. Models disagree on how to say that (probed
// 2026-10-03): gemini-3.5-flash-lite rejects thinkingBudget 0 with a 400 but
// accepts thinkingLevel "minimal"; the Flash models accept thinkingBudget 0.
export function thinkingConfig(model: string) {
  return model.includes("flash-lite")
    ? { thinkingLevel: "minimal" }
    : { thinkingBudget: 0 };
}

// Stage times measured in the M1 eval (22 plans, docs/evals/2026-10-03-m1.md):
// generation took 8.7s at the median, 11.0s at p95 and 12.2s at most; grounding
// (place lookups and Wikipedia, after generation) took 13.7s, and 23.0s at p95.
const GROUNDING_RESERVE_MS = 23_000; // kept back for grounding: its p95
const MIN_ATTEMPT_MS = 12_000; // a shorter attempt would cut off the slowest measured answer
const MAX_ATTEMPT_MS = 45_000;
const DEFAULT_BUDGET_MS = 55_000;
/** The least time a plan needs once generation starts: one attempt, then grounding. */
export const GENERATION_MIN_MS = MIN_ATTEMPT_MS + GROUNDING_RESERVE_MS;

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

// Gemini writes fields in schema order, so noteFit comes before any place is chosen.
const responseSchema = {
  type: "object",
  properties: {
    destinationFull: { type: "string" },
    noteFit: { type: "string" },
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
          lang: { type: "string" },
          pronunciation: { type: "string" },
        },
        required: ["phrase", "meaning", "lang", "pronunciation"],
      },
    },
    etiquette: { type: "array", items: { type: "string" } },
  },
  required: [
    "destinationFull",
    "noteFit",
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
  attempts: GenerationAttempt[];
  constructor(message: string, status = 502, attempts: GenerationAttempt[] = []) {
    super(message);
    this.name = "GeminiError";
    this.status = status;
    this.attempts = attempts;
  }
}

/** A finished generation: the plan, the model version that wrote it, every try. */
export interface Generation {
  itinerary: ModelItinerary;
  model: string;
  attempts: GenerationAttempt[];
}

/** One structured-output call, tried on each model in turn within the deadline. */
export interface JsonCall {
  prompt: string;
  schema: object;
  models: string[];
  deadline: number;
  reserveMs: number; // kept back for the stages after this call
  minAttemptMs: number; // don't start an attempt with less time than this
  maxAttemptMs: number;
  temperature: number;
  span: SpanName; // how the attempts appear in the trace
}

interface AttemptResult {
  attempt: GenerationAttempt;
  value?: unknown;
  modelVersion?: string;
  detail?: string; // upstream error text, for server logs only
}

async function requestOnce(
  model: string,
  call: JsonCall,
  timeoutMs: number,
  apiKey: string
): Promise<AttemptResult> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const body = {
    contents: [{ role: "user", parts: [{ text: call.prompt }] }],
    generationConfig: {
      temperature: call.temperature,
      responseMimeType: "application/json",
      responseSchema: call.schema,
      thinkingConfig: thinkingConfig(model),
    },
  };
  const start = Date.now();
  const end = startSpan(call.span, model);
  const attempt = (status: GenerationAttempt["status"]): GenerationAttempt => {
    end(String(status));
    return { model, status, ms: Date.now() - start };
  };

  // The timer stays armed until the body is read, so a stalled response can't
  // outlive the deadline either.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      const detail = (await res.text().catch(() => "")).slice(0, 300);
      return { attempt: attempt(res.status), detail };
    }
    const data = (await res.json()) as GeminiApiResponse;
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      return { attempt: attempt(data?.promptFeedback?.blockReason ? "blocked" : "empty") };
    }
    const value: unknown = JSON.parse(text); // before attempt(): a bad body is "bad-json"
    return { attempt: attempt(res.status), value, modelVersion: data.modelVersion ?? model };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") return { attempt: attempt("timeout") };
    if (err instanceof SyntaxError) return { attempt: attempt("bad-json") };
    return { attempt: attempt("network") };
  } finally {
    clearTimeout(timeout);
  }
}

/** What the visitor sees when every attempt failed; details go to the logs. */
function failure(attempts: GenerationAttempt[]): GeminiError {
  const statuses = attempts.map((a) => a.status);
  if (statuses.includes("blocked")) {
    return new GeminiError(
      "The request was blocked by the model's safety filters. Try rephrasing your notes.",
      400,
      attempts
    );
  }
  if (statuses.some((s) => s === 429 || s === 503)) {
    return new GeminiError(
      "The AI planner is busy right now. Please try again in a minute.",
      503,
      attempts
    );
  }
  if (statuses.length === 0 || statuses.includes("timeout")) {
    return new GeminiError("The guide took too long to respond. Please try again.", 504, attempts);
  }
  return new GeminiError("The AI planner couldn't create this trip. Please try again.", 502, attempts);
}

/**
 * Send a prompt and get JSON matching `call.schema` back, trying each model in
 * turn within the deadline. Throws a GeminiError when every attempt failed.
 */
export async function geminiJson<T>(
  call: JsonCall
): Promise<{ value: T; model: string; attempts: GenerationAttempt[] }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new GeminiError(
      "Server is missing GEMINI_API_KEY. Set it as an environment variable.",
      500
    );
  }

  const attempts: GenerationAttempt[] = [];
  for (let i = 0; i < call.models.length; i++) {
    const model = call.models[i];
    const left = call.deadline - Date.now() - call.reserveMs;
    // Keep a full attempt for each model still to come, so a hung request can't
    // use up the fallback's time, unless that would leave this attempt too little.
    const kept = (call.models.length - 1 - i) * call.minAttemptMs;
    const timeoutMs = Math.min(call.maxAttemptMs, left - kept >= call.minAttemptMs ? left - kept : left);
    if (timeoutMs < call.minAttemptMs) break;
    const result = await requestOnce(model, call, timeoutMs, apiKey);
    attempts.push(result.attempt);
    if (result.value !== undefined) {
      return { value: result.value as T, model: result.modelVersion ?? model, attempts };
    }
    console.warn("Gemini attempt failed:", JSON.stringify(result.attempt), result.detail ?? "");
    // A bad key fails for every model, and a blocked prompt would be blocked again.
    const status = result.attempt.status;
    if (status === 401 || status === 403 || status === "blocked") break;
  }
  throw failure(attempts);
}

/**
 * The itinerary call: strict `ModelItinerary` JSON (enforced by `responseSchema`),
 * from the primary model, then the fallback. Shared by the single-model plan and
 * by ensemble synthesis (lib/orchestrator.ts).
 */
export async function geminiStructured(
  promptText: string,
  deadline = Date.now() + DEFAULT_BUDGET_MS
): Promise<Generation> {
  const { value, model, attempts } = await geminiJson<ModelItinerary>({
    prompt: promptText,
    schema: responseSchema,
    models: [PRIMARY_MODEL, FALLBACK_MODEL],
    deadline,
    reserveMs: GROUNDING_RESERVE_MS,
    minAttemptMs: MIN_ATTEMPT_MS,
    maxAttemptMs: MAX_ATTEMPT_MS,
    temperature: 0.8,
    span: "gemini",
  });
  return { itinerary: value, model, attempts };
}

/** Request deadline (epoch ms) plus facts the prompt should include. */
export interface GenerateOptions {
  deadline?: number;
  resolvedAs?: string;
}

/** Single-model itinerary (phase 1 path; also the ensemble's terminal fallback). */
export function generateItinerary(
  req: PlanRequest,
  opts: GenerateOptions = {}
): Promise<Generation> {
  return geminiStructured(buildPrompt(req, { resolvedAs: opts.resolvedAs }), opts.deadline);
}

interface GeminiApiResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
  }>;
  promptFeedback?: { blockReason?: string };
  modelVersion?: string;
}
