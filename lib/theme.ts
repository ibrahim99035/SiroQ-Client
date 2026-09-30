/**
 * Theme plumbing shared by the pre-paint script and the React provider.
 *
 * Kept separate from the components because two very different environments
 * have to agree exactly: the inline `<script>` that runs before first paint,
 * and the client component that renders the toggle. A key or value drifting
 * between them shows up as a flash of the wrong theme, so both import from here.
 */

export type Theme = "light" | "dark" | "system";

/** Resolved value written to `documentElement.dataset.theme`. */
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "siroq-theme";

export const THEME_OPTIONS: readonly Theme[] = ["light", "dark", "system"];

export function isTheme(value: unknown): value is Theme {
  return typeof value === "string" && THEME_OPTIONS.includes(value as Theme);
}

/**
 * Resolves the stored preference against the OS setting.
 *
 * `"system"` and anything unreadable (private mode, disabled storage, a
 * `SecurityError` on `localStorage`) both fall through to the media query, so
 * the worst case is "follows the OS", never a crash or an unstyled page.
 */
export function resolveTheme(preference: Theme): ResolvedTheme {
  if (preference !== "system") return preference;
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

/** Reads the stored preference. Safe to call before hydration. */
export function readStoredTheme(): Theme {
  if (typeof window === "undefined") return "system";
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isTheme(stored) ? stored : "system";
  } catch {
    return "system";
  }
}

/**
 * Applies the resolved theme to the document.
 *
 * `dataset.theme` always holds a concrete `light`/`dark`, never `system`. That
 * keeps the CSS simple: the attribute block in `globals.css` handles an explicit
 * choice, and the `prefers-color-scheme` block only takes effect when the
 * attribute is absent — i.e. when JavaScript never ran.
 */
export function applyTheme(resolved: ResolvedTheme) {
  const root = document.documentElement;
  root.dataset.theme = resolved;
  root.style.colorScheme = resolved;
}

/**
 * Blocking script injected into `<head>`.
 *
 * Without this the server renders the light palette, React hydrates, and only
 * then corrects the theme — a visible flash for anyone whose choice or OS
 * setting is dark. Runs before paint, so it is deliberately synchronous and
 * dependency-free rather than a module.
 */
export const THEME_INIT_SCRIPT = `(function(){try{
var k=${JSON.stringify(THEME_STORAGE_KEY)},s=localStorage.getItem(k);
var p=(s==="light"||s==="dark"||s==="system")?s:"system";
var d=p==="system"
?(window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light")
:p;
document.documentElement.dataset.theme=d;
document.documentElement.style.colorScheme=d;
}catch(e){}})();`;
