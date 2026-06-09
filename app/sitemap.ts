import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://atlas.twistag.com";
  return [
    { url: `${base}/`, priority: 1 },
    { url: `${base}/pricing`, priority: 0.8 },
  ];
}
