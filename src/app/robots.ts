import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/soukromi"],
      disallow: ["/dashboard", "/login", "/profil", "/spaces"],
    },
    sitemap: "https://klopi.cz/sitemap.xml",
  };
}
