/**
 * Atlas Tailwind configuration — Vercel Geist design system.
 *
 * Bridges the CSS custom properties in tokens.css to Tailwind utility classes.
 * Two layers are exposed:
 *  - Semantic aliases (bg, surface, text, border, brand, success, …) — prefer
 *    these in product components so a token change repaints the whole app.
 *  - Raw Geist scales (gray / blue / red / amber / green / teal / purple /
 *    pink, steps 100–1000) — for the rare case you need a specific step.
 */

/** A Geist 100–1000 scale wired to CSS variables (theme-aware). */
const scale = (name) =>
  Object.fromEntries(
    [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000].map((s) => [
      s,
      `var(--${name}-${s})`,
    ]),
  );

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./emails/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Semantic aliases
        bg: "var(--bg)",
        surface: "var(--surface)",
        "surface-2": "var(--surface-2)",
        text: "var(--text)",
        "text-2": "var(--text-2)",
        "text-3": "var(--text-3)",
        "text-faint": "var(--text-faint)",
        border: "var(--border)",
        "border-strong": "var(--border-strong)",
        brand: {
          DEFAULT: "var(--brand)",
          hover: "var(--brand-hover)",
          soft: "var(--brand-soft)",
        },
        "accent-blue": {
          DEFAULT: "var(--accent-blue)",
          hover: "var(--accent-blue-hover)",
          soft: "var(--accent-blue-soft)",
          text: "var(--accent-blue-text)",
        },
        accent: {
          DEFAULT: "var(--accent)",
          ink: "var(--accent-ink)",
        },
        success: {
          DEFAULT: "var(--success)",
          strong: "var(--success-strong)",
          soft: "var(--success-soft)",
        },
        warning: {
          DEFAULT: "var(--warning)",
          soft: "var(--warning-soft)",
        },
        danger: {
          DEFAULT: "var(--danger)",
          strong: "var(--danger-strong)",
          soft: "var(--danger-soft)",
        },
        focus: "var(--focus-ring)",
        // Raw Geist scales
        gray: scale("gray"),
        blue: scale("blue"),
        red: scale("red"),
        amber: scale("amber"),
        green: scale("green"),
        teal: scale("teal"),
        purple: scale("purple"),
        pink: scale("pink"),
      },
      fontFamily: {
        sans: ["var(--font-sans)"],
        mono: ["var(--font-mono)"],
      },
      borderRadius: {
        sm: "var(--radius-sm)",
        DEFAULT: "var(--radius)",
        lg: "var(--radius-lg)",
        xl: "var(--radius-xl)",
        full: "var(--radius-full)",
      },
      boxShadow: {
        sm: "var(--shadow-sm)",
        DEFAULT: "var(--shadow)",
        lg: "var(--shadow-lg)",
      },
      // Geist type scale: copy/label sizes for body + UI, heading sizes with
      // tightening tracking as size grows.
      fontSize: {
        xs: ["12px", { lineHeight: "16px" }],
        sm: ["13px", { lineHeight: "18px" }],
        base: ["14px", { lineHeight: "20px" }],
        md: ["15px", { lineHeight: "22px", letterSpacing: "-0.01em" }],
        lg: ["16px", { lineHeight: "24px", letterSpacing: "-0.02em" }],
        xl: ["20px", { lineHeight: "26px", letterSpacing: "-0.02em" }],
        "2xl": ["24px", { lineHeight: "32px", letterSpacing: "-0.04em" }],
        "3xl": ["32px", { lineHeight: "40px", letterSpacing: "-0.04em" }],
        "4xl": ["40px", { lineHeight: "48px", letterSpacing: "-0.06em" }],
        "5xl": ["56px", { lineHeight: "1", letterSpacing: "-0.06em" }],
        "6xl": ["72px", { lineHeight: "1", letterSpacing: "-0.06em" }],
      },
      transitionTimingFunction: {
        geist: "cubic-bezier(0.175, 0.885, 0.32, 1.1)",
      },
      transitionDuration: {
        fast: "150ms",
        DEFAULT: "200ms",
        slow: "300ms",
      },
    },
  },
  plugins: [],
};
