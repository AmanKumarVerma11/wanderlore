// Itinerary URLs are rendered as links and images, and saved itineraries come
// back from the client (/api/save), so every URL is re-checked before use: https
// only, and only the hosts the server itself produces links to.

const ALLOWED_HOSTS = [
  "openstreetmap.org",
  "wikipedia.org",
  "wikimedia.org",
  "creativecommons.org", // licence links in photo credits
];

/** Returns the normalised URL when it is safe to render, otherwise null. */
export function safeHttpsUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  const host = url.hostname.toLowerCase();
  const allowed = ALLOWED_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
  return allowed ? url.href : null;
}
