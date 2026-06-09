import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Atlas — Operational discovery for teams that ship",
  description:
    "Atlas runs short, structured conversations with your team to surface the bottlenecks and AI-shaped opportunities that hide between your systems. Output: a ranked plan + pre-drafted SOWs.",
  metadataBase: new URL("https://atlas.twistag.com"),
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
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Fraunces:ital,opsz,wght@0,9..144,500;0,9..144,600;1,9..144,500&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
