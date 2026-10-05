// Cache for deterministic lookups (geocodes, Wikipedia). Nominatim's usage policy
// requires caching its results. Two tiers: an in-process LRU that survives between
// requests on a warm instance, and the shared KV store when it is configured.
// `null` is a valid cached value ("looked up, not found"); undefined means a miss.

import { kv } from "./kv";

const MAX_ENTRIES = 2000;
const MEMORY_TTL_MS = 6 * 60 * 60 * 1000; // re-read the shared store after 6h
const memory = new Map<string, { value: unknown; expires: number }>();

function remember(key: string, value: unknown, ttlMs: number) {
  memory.delete(key);
  memory.set(key, { value, expires: Date.now() + ttlMs });
  if (memory.size > MAX_ENTRIES) {
    memory.delete(memory.keys().next().value as string); // oldest entry
  }
}

export async function cacheGet<T>(key: string): Promise<T | undefined> {
  const hit = memory.get(key);
  if (hit && hit.expires > Date.now()) {
    remember(key, hit.value, hit.expires - Date.now()); // refresh LRU order
    return hit.value as T;
  }
  memory.delete(key);
  const raw = await kv(["GET", key]);
  if (typeof raw !== "string") return undefined;
  try {
    const value = JSON.parse(raw) as T;
    remember(key, value, MEMORY_TTL_MS);
    return value;
  } catch {
    return undefined;
  }
}

export async function cacheSet(key: string, value: unknown, ttlSeconds: number) {
  remember(key, value, Math.min(ttlSeconds * 1000, MEMORY_TTL_MS));
  await kv(["SET", key, JSON.stringify(value), "EX", ttlSeconds]);
}

/** Test helper: forget everything held in memory. */
export function clearMemoryCache() {
  memory.clear();
}
