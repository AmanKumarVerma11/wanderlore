// OpenAI-compatible client for NVIDIA's NIM endpoint (integrate.api.nvidia.com).
// Server-only: the key is read from an env var and never reaches the client. Used
// by the orchestrator to fan out to a diverse model panel. Gemini stays the
// reliable synthesizer/fallback (see lib/orchestrator.ts).

export class NvidiaError extends Error {
  status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.name = "NvidiaError";
    this.status = status;
  }
}

const BASE_URL =
  process.env.NVIDIA_BASE_URL || "https://integrate.api.nvidia.com/v1";

/** True when a key is configured. When false the ensemble turns off and the app
 *  runs the unchanged single-Gemini path. */
export function isNvidiaEnabled(): boolean {
  return Boolean(process.env.NVIDIA_API_KEY);
}

interface NvidiaChatOptions {
  model: string;
  prompt: string;
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  signal?: AbortSignal;
}

/** Single chat.completions call. Returns the assistant text. Throws NvidiaError on
 *  any failure — callers treat that as "drop this panelist". */
export async function nvidiaChat(opts: NvidiaChatOptions): Promise<string> {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) throw new NvidiaError("NVIDIA_API_KEY is not set.", 500);
  // An empty prompt makes the endpoint hang — refuse it up front.
  if (!opts.prompt.trim()) {
    throw new NvidiaError("Refusing to send an empty prompt.", 400);
  }

  const body = {
    model: opts.model,
    messages: [{ role: "user", content: opts.prompt }],
    max_tokens: opts.maxTokens ?? 1600,
    temperature: opts.temperature ?? 0.85,
    top_p: opts.topP ?? 0.95,
    stream: false,
  };

  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal: opts.signal,
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new NvidiaError(
      `NVIDIA request failed (${res.status}). ${detail.slice(0, 200)}`,
      res.status
    );
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const text = data?.choices?.[0]?.message?.content?.trim();
  if (!text) throw new NvidiaError("NVIDIA returned an empty response.", 502);
  return text;
}
