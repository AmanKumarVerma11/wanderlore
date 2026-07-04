// Real heritage context via the Wikipedia REST summary API (free, no key).
// Provides a citeable description + thumbnail image for the destination and a
// few key sites, so the "heritage" content is grounded in a real source.

import type { WikiRef } from "./types";

const SUMMARY = "https://en.wikipedia.org/api/rest_v1/page/summary/";
const UA = "Wanderlore/1.0 (cultural trip planner; https://github.com/AmanKumarVerma11)";

/** Fetch a Wikipedia summary for a page title. Returns null if not found. */
export async function wikiSummary(title: string): Promise<WikiRef | null> {
  const url = SUMMARY + encodeURIComponent(title.replace(/\s+/g, "_"));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      type?: string;
      title?: string;
      extract?: string;
      thumbnail?: { source?: string };
      content_urls?: { desktop?: { page?: string } };
    };
    // Skip disambiguation / empty pages — they aren't useful context.
    if (data.type === "disambiguation" || !data.extract || !data.title) {
      return null;
    }
    return {
      title: data.title,
      extract: data.extract,
      image: data.thumbnail?.source ?? null,
      url:
        data.content_urls?.desktop?.page ??
        `https://en.wikipedia.org/wiki/${encodeURIComponent(data.title)}`,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/** Fetch several summaries concurrently, dropping the ones that don't resolve. */
export async function wikiMany(titles: string[]): Promise<WikiRef[]> {
  const unique = Array.from(new Set(titles)).slice(0, 4);
  const refs = await Promise.all(unique.map((t) => wikiSummary(t)));
  return refs.filter((r): r is WikiRef => r !== null);
}
