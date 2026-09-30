"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
} from "react";

import {
  applyTheme,
  isTheme,
  resolveTheme,
  THEME_STORAGE_KEY,
  type ResolvedTheme,
  type Theme,
} from "@/lib/theme";
import {
  createPreferenceStore,
  getSystemTheme,
  getSystemThemeServer,
  subscribeToSystemTheme,
} from "@/lib/preference-store";

/**
 * The store is module-scoped so every consumer shares one subscription and one
 * cached read. `onApply` writes the resolved value to `<html>`, which is how the
 * DOM follows the store without an effect in this component.
 */
const store = createPreferenceStore<Theme>({
  key: THEME_STORAGE_KEY,
  isValid: isTheme,
  fallback: "system",
  onApply(value) {
    applyTheme(resolveTheme(value));
  },
});

type ThemeContextValue = {
  /** What the visitor picked: `system` follows the OS. */
  preference: Theme;
  /** What is actually on screen right now. */
  resolved: ResolvedTheme;
  setPreference: (next: Theme) => void;
  /** Flips between light and dark, leaving `system` behind. */
  toggle: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const preference = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getServerSnapshot,
  );

  // Live OS signal. Only consulted when the preference is `system`, but the
  // subscription stays mounted either way so switching back to `system` is
  // immediately correct rather than one interaction behind.
  const prefersDark = useSyncExternalStore(
    subscribeToSystemTheme,
    getSystemTheme,
    getSystemThemeServer,
  );

  const resolved: ResolvedTheme =
    preference === "system" ? (prefersDark ? "dark" : "light") : preference;

  const setPreference = useCallback((next: Theme) => {
    if (!isTheme(next)) return;
    store.set(next);
  }, []);

  const toggle = useCallback(() => {
    store.set(resolved === "dark" ? "light" : "dark");
  }, [resolved]);

  const value = useMemo(
    () => ({ preference, resolved, setPreference, toggle }),
    [preference, resolved, setPreference, toggle],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/**
 * Reads the theme context.
 *
 * Throws outside a provider rather than returning a fallback: a missing provider
 * is a wiring bug, and silently returning "light" would make a mis-mounted toggle
 * look like it works while doing nothing.
 */
export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used inside <ThemeProvider>");
  }
  return ctx;
}
