import type { Config } from "tailwindcss";

/*
 * Monochrome editorial system: a near-white paper, near-black ink, a scale of
 * warm-neutral grays, and a single restrained red used only for emphasis and
 * interactive accents. No decorative color — hierarchy comes from type, space,
 * and hairline rules. Inspired by amankrverma.in (minimal B&W, one highlight).
 */
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "oklch(0.985 0 0 / <alpha-value>)", // page background
        surface: "oklch(1 0 0 / <alpha-value>)", // cards
        ink: "oklch(0.2 0 0 / <alpha-value>)", // near-black text
        "ink-soft": "oklch(0.34 0 0 / <alpha-value>)",
        muted: "oklch(0.53 0 0 / <alpha-value>)", // secondary text
        faint: "oklch(0.72 0 0 / <alpha-value>)",
        line: "oklch(0.905 0 0 / <alpha-value>)", // hairline borders
        "line-soft": "oklch(0.95 0 0 / <alpha-value>)",
        accent: {
          DEFAULT: "oklch(0.585 0.222 26 / <alpha-value>)", // the one red
          dark: "oklch(0.51 0.2 26 / <alpha-value>)",
          soft: "oklch(0.955 0.03 24 / <alpha-value>)",
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      letterSpacing: {
        tightest: "-0.03em",
      },
      boxShadow: {
        soft: "0 1px 2px oklch(0 0 0 / 0.04), 0 12px 32px oklch(0 0 0 / 0.05)",
      },
      maxWidth: {
        prose: "42rem",
      },
    },
  },
  plugins: [],
};

export default config;
