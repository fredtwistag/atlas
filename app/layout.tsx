import type { Metadata } from "next";
import { dmSans, jetbrainsMono } from "./fonts";
import { env } from "@/lib/env";
import "./globals.css";

export const metadata: Metadata = {
  title: "Atlas — Operational discovery for teams that ship",
  description:
    "Atlas runs short, structured conversations with your team to surface the bottlenecks and AI-shaped opportunities that hide between your systems. Output: a ranked plan + pre-drafted SOWs.",
  // Canonical base for OG/relative URLs — honors APP_URL in prod, falls back to
  // the production host. Keep in sync with robots.ts / sitemap.ts (plan 022).
  metadataBase: new URL(env.appUrl()),
  openGraph: {
    title: "Atlas — Operational discovery for teams that ship",
    description:
      "A ranked, ROI-scored opportunity backlog with click-through evidence, in 3–4 weeks.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${dmSans.variable} ${jetbrainsMono.variable}`}
      // Browser extensions (LanguageTool, Grammarly, etc.) inject attributes
      // like data-lt-installed onto <html> before React hydrates; ignore those
      // attribute-only diffs on this element.
      suppressHydrationWarning
    >
      <body>{children}</body>
    </html>
  );
}
