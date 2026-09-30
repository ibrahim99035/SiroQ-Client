"use client";

/**
 * A tiny persisted-preference store, shaped for `useSyncExternalStore`.
 *
 * Both the theme and the locale need the same three things: read a preference
 * from `localStorage`, let a component subscribe to changes, and write a new
 * value. The obvious implementation — `useState` plus a `useEffect` that calls
 * `setState` — is what the `react-hooks` lint rule flags as a cascading render,
 * and it genuinely does render twice on every load.
 *
 * `useSyncExternalStore` avoids that: React reads the store directly during
 * hydration, so there is no effect, no second render, and no flash between the
 * two.
 *
 * The store deliberately caches after the first read. `localStorage` is a
 * synchronous IPC call on some platforms, and `getSnapshot` runs on every render,
 * so re-reading it each time would put it on the hot path.
 */

export type PreferenceStore<T> = {
  subscribe: (onChange: () => void) => () => void;
  /** Client snapshot. Must be referentially stable between reads. */
  getSnapshot: () => T;
  /** Server snapshot: the pre-hydration answer. */
  getServerSnapshot: () => T;
  set: (next: T) => void;
};

export function createPreferenceStore<T>({
  key,
  isValid,
  fallback,
  onApply,
}: {
  /** `localStorage` key. */
  key: string;
  /** Guards against a hand-edited or stale value in storage. */
  isValid: (value: unknown) => value is T;
  fallback: T;
  /**
   * Called whenever the value changes, including on the first client read.
   *
   * This is how the change reaches the DOM: the pre-paint script in
   * `app/layout.tsx` handles the initial load, and this keeps `<html>` in step
   * afterwards without a `useEffect` in the provider.
   */
  onApply?: (value: T) => void;
}): PreferenceStore<T> {
  const listeners = new Set<() => void>();
  let cache: T | null = null;

  function read(): T {
    if (cache !== null) return cache;
    let value = fallback;
    try {
      const stored = window.localStorage.getItem(key);
      if (isValid(stored)) value = stored;
    } catch {
      // Storage can throw (private mode, blocked third-party context). The
      // fallback is a usable answer, so there is nothing to surface.
    }
    cache = value;
    onApply?.(value);
    return value;
  }

  return {
    subscribe(onChange) {
      listeners.add(onChange);
      return () => {
        listeners.delete(onChange);
      };
    },
    getSnapshot: read,
    getServerSnapshot: () => fallback,
    set(next) {
      if (cache === next) return;
      cache = next;
      try {
        window.localStorage.setItem(key, String(next));
      } catch {
        // Applies for this page view; just will not survive a reload.
      }
      onApply?.(next);
      for (const listener of listeners) listener();
    },
  };
}

/**
 * Subscribes to the OS colour preference.
 *
 * Split out from the store because `prefers-color-scheme` is a live browser
 * signal rather than something we persist — a visitor on "system" expects the
 * page to follow a desktop switching to dark at sunset, without a reload.
 */
export function subscribeToSystemTheme(onChange: () => void): () => void {
  const query = window.matchMedia("(prefers-color-scheme: dark)");
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

export function getSystemTheme(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/** Server has no media queries; assume light so the first paint matches HTML. */
export function getSystemThemeServer(): boolean {
  return false;
}
