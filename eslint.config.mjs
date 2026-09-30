import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

/**
 * Flat config. `next lint` was removed in Next 16 and `eslint-config-next@16`
 * requires ESLint >= 9, so the legacy `.eslintrc.json` is no longer usable.
 *
 * @type {import("eslint").Linter.Config[]}
 */
const config = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    rules: {
      /**
       * `lib/data.ts` keeps its original 21 call signatures so the ~14
       * consumers can migrate independently. Once a function is backed by a
       * real endpoint, its `user: User` argument is no longer read — the
       * server re-derives scope from the session, which is the only place
       * authorization may be decided. Underscore-prefixed parameters mark
       * exactly those, so they should not read as mistakes.
       */
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      // Uploaded filings are runtime data, not source.
      "data/**",
    ],
  },
];

export default config;
