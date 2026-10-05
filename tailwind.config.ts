import type { Config } from "tailwindcss";

/*
 * Monochrome editorial system: a near-white paper, near-black ink, a scale of
 * warm-neutral grays, and a single red. The look is maximalist editorial (a big
 * display serif, oversized numerals, poster frames with offset shadows, stamps)
 * held together by one grid and these few colours.
 *
 * Contrast on paper (WCAG): ink 17.3, ink-soft 11.3, muted 5.1, accent-dark 6.1,
 * accent 4.5 (large text and graphics only), faint 2.4 (never for text).
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
        display: ["var(--font-display)", "Georgia", "serif"],
      },
      letterSpacing: {
        tightest: "-0.03em",
      },
      boxShadow: {
        soft: "0 1px 2px oklch(0 0 0 / 0.04), 0 12px 32px oklch(0 0 0 / 0.05)",
        // Poster frames: a hard shadow, offset down and right.
        offset: "6px 6px 0 0 oklch(0.2 0 0)",
        "offset-sm": "3px 3px 0 0 oklch(0.2 0 0)",
        "offset-accent": "6px 6px 0 0 oklch(0.51 0.2 26)",
      },
      maxWidth: {
        prose: "42rem",
      },
    },
  },
  plugins: [],
};

export default config;
