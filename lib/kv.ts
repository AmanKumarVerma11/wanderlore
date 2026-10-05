// Optional shared key-value store: Upstash Redis over its REST API (free tier).
// Used for the lookup cache, the cross-instance Nominatim limiter and rate limits.
// Every call degrades to "unavailable" (undefined), so the app never fails because
// the store is down or not configured.

function config(): { url: string; token: string } | null {
  // Upstash's own names first; KV_* are what Vercel's Upstash integration injects.
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  return url && token ? { url: url.replace(/\/$/, ""), token } : null;
}

export function isKvEnabled(): boolean {
  return config() !== null;
}

type Command = Array<string | number>;

async function post(path: string, body: Command | Command[]): Promise<unknown> {
  const c = config();
  if (!c) return undefined;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1500);
  try {
    const res = await fetch(c.url + path, {
      method: "POST",
      headers: { Authorization: `Bearer ${c.token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
      cache: "no-store",
    });
    return res.ok ? await res.json() : undefined;
  } catch {
    return undefined;
  } finally {
    clearTimeout(timeout);
  }
}

/** Run one Redis command, e.g. ["GET", key]. Undefined when unavailable. */
export async function kv(command: Command): Promise<unknown> {
  const data = (await post("", command)) as { result?: unknown; error?: string } | undefined;
  return data && !data.error ? data.result : undefined;
}

/** Run several commands in one round trip. Undefined when unavailable. */
export async function kvPipeline(commands: Command[]): Promise<unknown[] | undefined> {
  const data = (await post("/pipeline", commands)) as
    | Array<{ result?: unknown; error?: string }>
    | undefined;
  if (!Array.isArray(data) || data.some((d) => d.error)) return undefined;
  return data.map((d) => d.result);
}
