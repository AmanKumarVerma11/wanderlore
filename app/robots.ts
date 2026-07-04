import type { MetadataRoute } from "next";

const SITE_URL = "https://wanderlore.amankrverma.in";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // User-generated shared trips aren't useful in a search index.
      disallow: "/t/",
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
