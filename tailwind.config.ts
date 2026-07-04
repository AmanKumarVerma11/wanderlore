import type { Config } from "tailwindcss";

/*
 * "Atlas dusk" palette in OKLCH — a warm-paper background with deep teal ink and
 * a saffron/marigold accent (travel + heritage, not the reflexive tourism blue).
 * Every neutral is tinted so the UI reads as an editorial travel journal.
 */
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "oklch(0.985 0.01 85 / <alpha-value>)",
        surface: "oklch(0.997 0.004 90 / <alpha-value>)",
        ink: "oklch(0.29 0.03 195 / <alpha-value>)",
        muted: "oklch(0.52 0.02 200 / <alpha-value>)",
        line: "oklch(0.9 0.012 200 / <alpha-value>)",
        accent: {
          DEFAULT: "oklch(0.7 0.15 62 / <alpha-value>)",
          dark: "oklch(0.58 0.14 55 / <alpha-value>)",
          soft: "oklch(0.95 0.04 75 / <alpha-value>)",
        },
        teal: {
          DEFAULT: "oklch(0.52 0.09 190 / <alpha-value>)",
          soft: "oklch(0.94 0.03 190 / <alpha-value>)",
        },
        ok: "oklch(0.6 0.11 160 / <alpha-value>)",
        warn: "oklch(0.74 0.13 75 / <alpha-value>)",
        danger: "oklch(0.57 0.16 28 / <alpha-value>)",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        serif: ["var(--font-fraunces)", "Georgia", "serif"],
      },
      boxShadow: {
        soft: "0 1px 2px oklch(0.4 0.05 200 / 0.05), 0 10px 30px oklch(0.4 0.05 200 / 0.07)",
      },
    },
  },
  plugins: [],
};

export default config;
