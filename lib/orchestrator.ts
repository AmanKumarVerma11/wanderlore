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
import { geminiStructured, generateItinerary } from "./gemini";
import { buildPanelistPrompt, buildSynthesisPrompt } from "./prompts";

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
const MIN_QUORUM = Number(process.env.PANEL_MIN_QUORUM) || 1;
const MAX_GEO_PLACES = Number(process.env.MAX_GEO_PLACES) || 15;

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
async function callPanelist(model: string, prompt: string): Promise<PanelOutcome> {
  const start = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PANEL_TIMEOUT_MS);
  try {
    const text = await nvidiaChat({
      model,
      prompt,
      maxTokens: 900,
      temperature: 0.9,
      signal: controller.signal,
    });
    return { model, ok: true, ms: Date.now() - start, text };
  } catch {
    return { model, ok: false, ms: Date.now() - start };
  } finally {
    clearTimeout(timer);
  }
}

function singleMeta(
  panel: OrchestrationMeta["panel"],
  degraded: boolean
): OrchestrationMeta {
  return { mode: "single", synthesizer: "gemini", panel, panelistsUsed: 0, degraded };
}

export async function generateItineraryEnsemble(
  req: PlanRequest
): Promise<OrchestrationResult> {
  // Feature-gated: no NVIDIA key -> behave exactly like phase 1 (single Gemini).
  if (!isNvidiaEnabled()) {
    const model = await generateItinerary(req);
    return { model, meta: singleMeta([], false) };
  }

  // Fan out to the panel in parallel; each member self-caps at PANEL_TIMEOUT_MS.
  const models = panelModels();
  const prompt = buildPanelistPrompt(req);
  const outcomes = await Promise.all(models.map((m) => callPanelist(m, prompt)));
  const panel = outcomes.map(({ model, ok, ms }) => ({ model, ok, ms }));
  const candidates = outcomes
    .filter((o) => o.ok && o.text)
    .map((o) => o.text as string);

  // Too few panelists answered -> single Gemini call (still a real, valid plan).
  if (candidates.length < MIN_QUORUM) {
    const model = await generateItinerary(req);
    return { model, meta: singleMeta(panel, true) };
  }

  // Synthesize the best plan with Gemini's guaranteed-schema call.
  try {
    const model = await geminiStructured(
      buildSynthesisPrompt(req, candidates, MAX_GEO_PLACES)
    );
    return {
      model,
      meta: {
        mode: "ensemble",
        synthesizer: "gemini",
        panel,
        panelistsUsed: candidates.length,
        degraded: candidates.length < models.length,
      },
    };
  } catch {
    // Synthesis failed -> last-ditch single Gemini so the request still succeeds.
    const model = await generateItinerary(req);
    return { model, meta: singleMeta(panel, true) };
  }
}
