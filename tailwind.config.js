/**
 * Atlas Tailwind configuration (root).
 * The theme is owned by design/tailwind.config.js (the design-system source of
 * truth). This root config reuses that theme verbatim and only sets the app's
 * content globs, so the two can never drift.
 */
const design = require("./design/tailwind.config.js");

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./emails/**/*.{ts,tsx}",
  ],
  theme: design.theme,
  plugins: design.plugins ?? [],
};
