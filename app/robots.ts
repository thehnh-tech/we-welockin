import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Only the API is blocked. /room/ is deliberately crawlable: those
        // pages carry their own noindex (app/room/[id]/layout.tsx), which a
        // crawler can only obey if it is allowed to fetch them — and blocking
        // them here would also stop link-preview bots from rendering an
        // invite's Open Graph card.
        disallow: ["/api/"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
