import type { Config } from "tailwindcss";
import defaultTheme from "tailwindcss/defaultTheme";
import animate from "tailwindcss-animate";
import typography from "@tailwindcss/typography";

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
      // `typography` supplies the `prose` scale that the TipTap report editor
      // and its read-only renderer both ask for. Without it those class names
      // are inert and rich text falls back to the browser's own defaults for
      // headings, lists, quotes, code and tables.
      //
      // Left alone the plugin ships Tailwind's gray palette, which reads as a
      // different product next to this one. Every colour is remapped onto a
      // project token instead — expressed as `var(--token)` so the dark block
      // in `globals.css` flips the rich text along with the rest of the
      // interface, which literal hex values would not do. Mirrors `.prose-doc`.
      typography: ({ theme }: { theme: (path: string) => string }) => ({
        DEFAULT: {
          css: {
            "--tw-prose-body": theme("colors.muted"),
            "--tw-prose-headings": theme("colors.ink"),
            "--tw-prose-lead": theme("colors.muted"),
            "--tw-prose-links": theme("colors.accent.DEFAULT"),
            "--tw-prose-bold": theme("colors.ink"),
            "--tw-prose-counters": theme("colors.accent.DEFAULT"),
            "--tw-prose-bullets": theme("colors.accent.DEFAULT"),
            "--tw-prose-hr": theme("colors.hairline"),
            "--tw-prose-quotes": theme("colors.muted"),
            "--tw-prose-quote-borders": theme("colors.hairline"),
            "--tw-prose-captions": theme("colors.muted"),
            "--tw-prose-code": theme("colors.ink"),
            "--tw-prose-pre-code": theme("colors.ink"),
            "--tw-prose-pre-bg": theme("colors.accent.soft"),
            "--tw-prose-th-borders": theme("colors.hairline"),
            "--tw-prose-td-borders": theme("colors.hairline"),
          },
        },
      }),
    },
  },
  plugins: [animate, typography],
};

export default config;