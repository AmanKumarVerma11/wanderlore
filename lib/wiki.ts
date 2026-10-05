// Real heritage context via the Wikipedia REST summary API (free, no key).
// Provides a citeable description + thumbnail image for the destination and a
// few key sites, so the "heritage" content is grounded in a real source.

import type { ImageCredit, WikiRef } from "./types";
import { cacheGet, cacheSet } from "./cache";
import { startSpan } from "./trace";

const SUMMARY = "https://en.wikipedia.org/api/rest_v1/page/summary/";
const UA = "Wanderlore/1.0 (cultural trip planner; https://github.com/AmanKumarVerma11)";

/** Fetch a Wikipedia summary for a page title. Returns null if not found. */
export async function wikiSummary(title: string): Promise<WikiRef | null> {
  const end = startSpan("wikipedia", title);
  const key = `wiki:v1:${title}`;
  const cached = await cacheGet<WikiRef | null>(key);
  if (cached !== undefined) {
    end(cached ? "found" : "no article", { cached: true });
    return cached;
  }
  const ref = await fetchSummary(title);
  end(ref === undefined ? "failed" : ref ? "found" : "no article");
  if (ref !== undefined) await cacheSet(key, ref, 7 * 86_400);
  return ref ?? null;
}

/** Null when the page doesn't exist; undefined when the request failed. */
async function fetchSummary(title: string): Promise<WikiRef | null | undefined> {
  const url = SUMMARY + encodeURIComponent(title.replace(/\s+/g, "_"));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: controller.signal,
    });
    if (res.status === 404) return null;
    if (!res.ok) return undefined;
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
    return undefined;
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

/**
 * File name of a Wikimedia Commons image URL, or null for anything else (for
 * example English-Wikipedia-only files, which are often non-free).
 */
export function commonsFileName(imageUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(imageUrl);
  } catch {
    return null;
  }
  if (!url.hostname.endsWith(".wikimedia.org")) return null;
  // /wikipedia/commons/[thumb/]a/ab/File.jpg[/330px-File.jpg]
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts[0] !== "wikipedia" || parts[1] !== "commons") return null;
  const name = parts[parts[2] === "thumb" ? 5 : 4];
  return name ? decodeURIComponent(name) : null;
}

function plainText(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Author and licence of a Commons photo, which its CC licence requires us to
 * show. Returns null when the licence can't be confirmed, so the caller can
 * drop the photo instead of showing it uncredited.
 */
export async function imageCredit(imageUrl: string): Promise<ImageCredit | null> {
  const file = commonsFileName(imageUrl);
  if (!file) return null;
  const end = startSpan("photo-credit", file);
  const key = `wikimg:v1:${file}`;
  const cached = await cacheGet<ImageCredit | null>(key);
  if (cached !== undefined) {
    end(cached ? "found" : "no licence", { cached: true });
    return cached;
  }
  const credit = await fetchCredit(file);
  end(credit === undefined ? "failed" : credit ? "found" : "no licence");
  if (credit !== undefined) await cacheSet(key, credit, 30 * 86_400);
  return credit ?? null;
}

/** Null when the licence is unknown; undefined when the request failed. */
async function fetchCredit(file: string): Promise<ImageCredit | null | undefined> {
  const url =
    "https://commons.wikimedia.org/w/api.php?action=query&format=json&formatversion=2" +
    "&prop=imageinfo&iiprop=extmetadata&iiextmetadatafilter=Artist|LicenseShortName|LicenseUrl" +
    `&titles=${encodeURIComponent(`File:${file}`)}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: controller.signal,
    });
    if (!res.ok) return undefined;
    const data = (await res.json()) as {
      query?: { pages?: Array<{ imageinfo?: Array<{ extmetadata?: Record<string, { value?: string }> }> }> };
    };
    const meta = data.query?.pages?.[0]?.imageinfo?.[0]?.extmetadata;
    const license = meta?.LicenseShortName?.value;
    if (!license) return null;
    // Commons fills Artist with boilerplate when the author isn't machine-readable:
    // "No machine-readable author provided. X assumed (based on copyright claims)."
    const artist = plainText(meta?.Artist?.value ?? "")
      .replace(/^No machine-readable author provided\.\s*/i, "")
      .replace(/\s*assumed \(based on copyright claims\)\.?$/i, "");
    return {
      artist: artist.slice(0, 120) || "Unknown author",
      license,
      licenseUrl: meta?.LicenseUrl?.value ?? null,
      fileUrl: `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(file.replace(/ /g, "_"))}`,
    };
  } catch {
    return undefined;
  } finally {
    clearTimeout(timeout);
  }
}
