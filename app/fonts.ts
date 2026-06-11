import { DM_Sans, JetBrains_Mono } from "next/font/google";
import localFont from "next/font/local";

export const dmSans = DM_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-dm-sans",
});

export const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-jetbrains",
});

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
