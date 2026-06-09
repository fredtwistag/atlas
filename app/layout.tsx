import type { Metadata } from "next";
import { inter, fraunces, jetbrainsMono } from "./fonts";
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
    <html
      lang="en"
      className={`${inter.variable} ${fraunces.variable} ${jetbrainsMono.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
