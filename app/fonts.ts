import localFont from "next/font/local";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";

/* Vercel's Geist design system fonts — the product UI/display family
 * (Geist Sans) and the numeric/code family (Geist Mono). Shipped as local
 * fonts by the `geist` package (no build-time Google Fonts fetch). They expose
 * the CSS variables `--font-geist-sans` and `--font-geist-mono`, wired into the
 * design tokens in design/tokens.css. */
export const geistSans = GeistSans;
export const geistMono = GeistMono;

/* Twistag's brand face — marketing surface only (applied via .theme-marketing
 * in design/tokens.css). Licensed webfont shared with twistag.com (files from
 * the twistag-react repo). Weight map mirrors twistag.com's cuts:
 * Light 300 · Regular 400 · Book 500 · Semibold 600. */
export const suisse = localFont({
  src: [
    { path: "./fonts/SuisseIntl-Light.woff2", weight: "300" },
    { path: "./fonts/SuisseIntl-Regular.woff2", weight: "400" },
    { path: "./fonts/SuisseIntl-Book.woff2", weight: "500" },
    { path: "./fonts/SuisseIntl-Semibold.woff2", weight: "600" },
  ],
  display: "swap",
  variable: "--font-suisse",
});
