import type { Config } from "tailwindcss";
import defaultTheme from "tailwindcss/defaultTheme";
import animate from "tailwindcss-animate";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        paper: "var(--paper)",
        "paper-raised": "var(--paper-raised)",
        ink: "var(--ink)",
        accent: {
          DEFAULT: "var(--accent)",
          strong: "var(--accent-strong)",
          warm: "var(--accent-warm)",
          muted: "var(--accent-muted)",
          soft: "var(--accent-soft)",
        },
        hairline: "var(--hairline)",
        status: {
          pending: "var(--status-pending)",
          "in-review": "var(--status-in-review)",
          reported: "var(--status-reported)",
          rejected: "var(--status-rejected)",
        },
        muted: "var(--muted-text)",
        danger: "var(--status-rejected)",
      },
      fontFamily: {
        sans: ["var(--font-plex-sans)", ...defaultTheme.fontFamily.sans],
        mono: [
          "var(--font-plex-mono)",
          "IBM Plex Mono",
          ...defaultTheme.fontFamily.mono,
        ],
      },
      borderRadius: {
        stamp: "8px",
        card: "16px",
        pill: "9999px",
      },
      boxShadow: {
        soft: "0 1px 2px rgba(22,48,46,0.05), 0 8px 24px -12px rgba(22,48,46,0.14)",
        lift: "0 12px 32px -12px rgba(22,48,46,0.22), 0 3px 8px -2px rgba(22,48,46,0.08)",
      },
      ringOffsetColor: {
        paper: "var(--paper)",
      },
      keyframes: {
        "timeline-pulse": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.45" },
        },
      },
      animation: {
        "timeline-pulse": "timeline-pulse 1.6s ease-in-out infinite",
      },
    },
  },
  plugins: [animate],
};

export default config;