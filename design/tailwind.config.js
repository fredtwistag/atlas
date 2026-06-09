/**
 * Atlas Tailwind configuration
 *
 * Bridges the CSS custom properties in tokens.css to Tailwind utility classes
 * so devs can use either approach. Prefer Tailwind classes for components;
 * fall back to vars in CSS modules for layout-level work.
 */

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
        success: {
          DEFAULT: "var(--success)",
          soft: "var(--success-soft)",
        },
        warning: {
          DEFAULT: "var(--warning)",
          soft: "var(--warning-soft)",
        },
        danger: {
          DEFAULT: "var(--danger)",
          soft: "var(--danger-soft)",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)"],
        serif: ["var(--font-serif)"],
        mono: ["var(--font-mono)"],
      },
      borderRadius: {
        sm: "var(--radius-sm)",
        DEFAULT: "var(--radius)",
        lg: "var(--radius-lg)",
        full: "var(--radius-full)",
      },
      boxShadow: {
        sm: "var(--shadow-sm)",
        DEFAULT: "var(--shadow)",
        lg: "var(--shadow-lg)",
      },
      fontSize: {
        xs: ["11px", { lineHeight: "1.5", letterSpacing: "0.04em" }],
        sm: ["12.5px", { lineHeight: "1.5" }],
        base: ["14px", { lineHeight: "1.55" }],
        md: ["14.5px", { lineHeight: "1.6", letterSpacing: "-0.005em" }],
        lg: ["16px", { lineHeight: "1.4", letterSpacing: "-0.01em" }],
        xl: ["18px", { lineHeight: "1.3", letterSpacing: "-0.015em" }],
        "2xl": ["22px", { lineHeight: "1.2", letterSpacing: "-0.02em" }],
        "3xl": ["28px", { lineHeight: "1.2", letterSpacing: "-0.02em" }],
        "4xl": ["42px", { lineHeight: "1.1", letterSpacing: "-0.025em" }],
        "5xl": ["56px", { lineHeight: "1.05", letterSpacing: "-0.03em" }],
        "6xl": ["72px", { lineHeight: "1.0", letterSpacing: "-0.035em" }],
      },
      transitionDuration: {
        fast: "120ms",
        DEFAULT: "150ms",
        slow: "250ms",
      },
    },
  },
  plugins: [],
};
