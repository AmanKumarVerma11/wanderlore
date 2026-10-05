// Multi-LLM orchestration: fan-out -> synthesize (mixture-of-agents).
//
// A diverse panel of NVIDIA models drafts candidate plans in parallel; Gemini
// then synthesizes the single best strict-schema ModelItinerary from whichever
// panelists responded. Every branch ends at a REAL model call, and the terminal
// fallback is the existing single-Gemini path — so this can only be MORE resilient
// than the single-model flow, never less. The final ModelItinerary is unchanged in
// shape, so the OSM/Wikipedia enrichment and the UI keep working untouched.

import type { ModelItinerary, OrchestrationMeta, PlanRequest } from "./types";
import { isNvidiaEnabled, nvidiaChat } from "./nvidia";
import {
  GENERATION_MIN_MS,
  GeminiError,
  geminiStructured,
  generateItinerary,
  type GenerateOptions,
  type Generation,
} from "./gemini";
import { buildPanelistPrompt, buildSynthesisPrompt } from "./prompts";
import { startSpan } from "./trace";

// Fast, reliable panelists (measured on this key): Mistral-Large-3 ~0.4s and
// GPT-OSS-120B ~0.6s to first token. Nemotron-3-super is a *reasoning* model
// (~20s even for a tiny reply) so it is excluded by default — too slow for the
// 60s serverless budget. Add more via NVIDIA_PANEL_MODELS if you have headroom.
const DEFAULT_PANEL = [
  "mistralai/mistral-large-3-675b-instruct-2512",
  "openai/gpt-oss-120b",
];

function panelModels(): string[] {
  const raw = process.env.NVIDIA_PANEL_MODELS;
  if (!raw) return DEFAULT_PANEL;
  const list = raw.split(",").map((s) => s.trim()).filter(Boolean);
  return list.length ? list : DEFAULT_PANEL;
}

const PANEL_TIMEOUT_MS = Number(process.env.PANEL_TIMEOUT_MS) || 14000;
const MIN_PANEL_MS = 5_000; // with less time than this, skip the panel
const MIN_QUORUM = Number(process.env.PANEL_MIN_QUORUM) || 1;

export interface OrchestrationResult {
  model: ModelItinerary;
  meta: OrchestrationMeta;
}

interface PanelOutcome {
  model: string;
  ok: boolean;
  ms: number;
  text?: string;
}

/** Call one panelist under its own hard timeout. Never throws — a failure or
 *  timeout just drops that panelist from the ensemble. */
async function callPanelist(model: string, prompt: string, timeoutMs: number): Promise<PanelOutcome> {
  const start = Date.now();
  const end = startSpan("panel", model);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const text = await nvidiaChat({
      model,
      prompt,
      maxTokens: 900,
      temperature: 0.9,
      signal: controller.signal,
    });
    end("ok");
    return { model, ok: true, ms: Date.now() - start, text };
  } catch (err) {
    end(err instanceof Error && err.name === "AbortError" ? "timeout" : "failed");
    return { model, ok: false, ms: Date.now() - start };
  } finally {
    clearTimeout(timer);
  }
}

function singleMeta(
  panel: OrchestrationMeta["panel"],
  degraded: boolean,
  gen: Generation
): OrchestrationMeta {
  return {
    mode: "single",
    synthesizer: "gemini",
    panel,
    panelistsUsed: 0,
    degraded,
    model: gen.model,
    attempts: gen.attempts,
  };
}

export async function generateItineraryEnsemble(
  req: PlanRequest,
  opts: GenerateOptions = {}
): Promise<OrchestrationResult> {
  const ctx = { resolvedAs: opts.resolvedAs };
  // The panel runs before generation, so it gets only what generation and
  // grounding don't need. Feature-gated: no NVIDIA key means single Gemini.
  const deadline = opts.deadline ?? Date.now() + 55_000;
  const panelMs = Math.min(PANEL_TIMEOUT_MS, deadline - Date.now() - GENERATION_MIN_MS);
  if (!isNvidiaEnabled() || panelMs < MIN_PANEL_MS) {
    const gen = await generateItinerary(req, opts);
    return { model: gen.itinerary, meta: singleMeta([], false, gen) };
  }

  // Fan out to the panel in parallel; each member self-caps at panelMs.
  const models = panelModels();
  const prompt = buildPanelistPrompt(req, ctx);
  const outcomes = await Promise.all(models.map((m) => callPanelist(m, prompt, panelMs)));
  const panel = outcomes.map(({ model, ok, ms }) => ({ model, ok, ms }));
  const candidates = outcomes
    .filter((o) => o.ok && o.text)
    .map((o) => o.text as string);

  // Too few panelists answered -> single Gemini call (still a real, valid plan).
  if (candidates.length < MIN_QUORUM) {
    const gen = await generateItinerary(req, opts);
    return { model: gen.itinerary, meta: singleMeta(panel, true, gen) };
  }

  // Synthesize the best plan with Gemini's guaranteed-schema call.
  try {
    const gen = await geminiStructured(
      buildSynthesisPrompt(req, candidates, ctx),
      opts.deadline
    );
    return {
      model: gen.itinerary,
      meta: {
        mode: "ensemble",
        synthesizer: "gemini",
        panel,
        panelistsUsed: candidates.length,
        degraded: candidates.length < models.length,
        model: gen.model,
        attempts: gen.attempts,
      },
    };
  } catch (err) {
    // Synthesis failed -> last-ditch single Gemini so the request still succeeds.
    const earlier = err instanceof GeminiError ? err.attempts : [];
    const gen = await generateItinerary(req, opts);
    return {
      model: gen.itinerary,
      meta: singleMeta(panel, true, { ...gen, attempts: [...earlier, ...gen.attempts] }),
    };
  }
}
