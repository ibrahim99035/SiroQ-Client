"use client";

import { useEffect, useRef, useState } from "react";

export type LoadState = "loading" | "error" | "ready";

/**
 * Loads a value from the async mock data layer. Every required view state —
 * loading / error / ready — is produced here; callers render skeletons,
 * error panels, and content from `state`.
 *
 * The loader is re-invoked whenever `reloadKey` changes (identity switches,
 * store revisions). Callers pass array literals such as
 * `[user?.id, revision, "stats"]`; the key is serialized to a primitive so
 * that a fresh-but-equal array does not restart the effect on every render.
 * The loader itself is read through a ref so a fresh closure (e.g. one
 * capturing the current user) is always used.
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
  const [data, setData] = useState<T | null>(null);
  const [state, setState] = useState<LoadState>("loading");
  const [error, setError] = useState<Error | null>(null);
  const attempt = useRef(0);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;
  const key = reloadKey === undefined ? undefined : JSON.stringify(reloadKey);

  const runRef = useRef(() => {});
  runRef.current = () => {
    const id = ++attempt.current;
    setState("loading");
    setError(null);
    loaderRef.current().then(
      (result) => {
        if (attempt.current === id) {
          setData(result);
          setState("ready");
        }
      },
      (reason: unknown) => {
        if (attempt.current === id) {
          setError(reason instanceof Error ? reason : new Error(String(reason)));
          setState("error");
        }
      },
    );
  };

  useEffect(() => {
    runRef.current();
  }, [key]);

  return { data, state, error, reload: () => runRef.current() };
}