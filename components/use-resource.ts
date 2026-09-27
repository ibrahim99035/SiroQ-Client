"use client";

import { useEffect, useRef, useState } from "react";

export type LoadState = "loading" | "error" | "ready";

/** One completed load, tagged with the token of the request that produced it. */
interface ResourceSnapshot<T> {
  token: string;
  data: T | null;
  error: Error | null;
}

/**
 * Loads a value from an async data source. Every required view state —
 * loading / error / ready — is produced here; callers render skeletons,
 * error panels, and content from `state`.
 *
 * The loader is re-invoked whenever `reloadKey` changes (identity switches,
 * store revisions) and whenever `reload()` is called. Callers pass array literals
 * such as `[user?.id, revision, "stats"]`; the key is serialized to a primitive
 * so that a fresh-but-equal array does not restart the effect on every render.
 *
 * The loader is read through a ref because callers pass a fresh closure each
 * render; listing it as an effect dependency would restart the load every
 * render. The ref is written in an effect rather than during render so React
 * never observes a mutated ref mid-render.
 */
export function useResource<T>(
  loader: () => Promise<T>,
  reloadKey: unknown,
): {
  data: T | null;
  state: LoadState;
  error: Error | null;
  reload: () => void;
} {
  const [snapshot, setSnapshot] = useState<ResourceSnapshot<T> | null>(null);
  const [reloadCount, setReloadCount] = useState(0);

  const loaderRef = useRef(loader);
  useEffect(() => {
    loaderRef.current = loader;
  });

  const key = reloadKey === undefined ? undefined : JSON.stringify(reloadKey);
  // Identifies the current request. A snapshot only counts as current while its
  // token still matches, so `state` is derived during render instead of being
  // reset to "loading" by an effect — which would cost an extra render pass.
  const token = `${key ?? ""}|${reloadCount}`;

  useEffect(() => {
    // Guards against a slow response from a superseded load overwriting fresher
    // data, and against setting state after unmount.
    let cancelled = false;
    loaderRef.current().then(
      (result) => {
        if (cancelled) return;
        setSnapshot({ token, data: result, error: null });
      },
      (reason: unknown) => {
        if (cancelled) return;
        setSnapshot({
          token,
          data: null,
          error: reason instanceof Error ? reason : new Error(String(reason)),
        });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [token]);

  const current = snapshot?.token === token ? snapshot : null;

  return {
    data: current?.data ?? null,
    state: current ? (current.error ? "error" : "ready") : "loading",
    error: current?.error ?? null,
    reload: () => setReloadCount((count) => count + 1),
  };
}