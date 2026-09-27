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
    ignores: [
      ".next/**",
      "node_modules/**",
      // Uploaded filings are runtime data, not source.
      "data/**",
    ],
  },
];

export default config;
