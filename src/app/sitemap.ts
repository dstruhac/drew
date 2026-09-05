import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: "https://klopi.cz", changeFrequency: "monthly", priority: 1 },
    { url: "https://klopi.cz/soukromi", changeFrequency: "yearly", priority: 0.2 },
  ];
}
