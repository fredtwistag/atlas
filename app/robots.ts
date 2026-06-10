import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/me", "/sprint", "/admin", "/twistag", "/session"],
      },
    ],
    sitemap: "https://atlas.twistag.com/sitemap.xml",
  };
}
