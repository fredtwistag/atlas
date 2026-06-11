import type { MetadataRoute } from "next";
import { env } from "@/lib/env";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/me", "/sprint", "/admin", "/twistag", "/session"],
      },
    ],
    sitemap: `${env.appUrl()}/sitemap.xml`,
  };
}
