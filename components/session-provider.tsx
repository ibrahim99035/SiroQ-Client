"use client";

import * as React from "react";

import { ApiError, apiFetch } from "@/lib/client-api";
import type { User } from "@/lib/types";

/**
 * The real signed-in user, fetched once from `/api/auth/me`.
 *
 * Why this exists: the client used to take its identity from the Zustand mock
 * store, where `useCurrentUser()` returned `seedUsers[0]` — a hardcoded person.
 * Every `PermissionGate`, nav item, and data fetch hung off that fake actor, so
 * the UI was describing a user who did not exist. The session cookie is httpOnly
 * and therefore unreadable by JavaScript; this provider is the only legitimate
 * way to learn the real identity, and it is deliberately thin: it resolves *who*
 * the user is, never *what* they may see. Scope is re-derived server-side on
 * every request from the session, so a doctored client cannot widen it.
 */

export type SessionStatus = "loading" | "ready" | "error";

export interface SessionValue {
  user: User | null;
  status: SessionStatus;
  error: ApiError | null;
  /** Re-reads `/api/auth/me`; call after a change that alters the identity. */
  reload: () => void;
}

const SessionContext = React.createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [nonce, setNonce] = React.useState(0);
  // Keyed by the nonce it was fetched for, so a stale response is ignored and
  // "still loading" is *derived during render* rather than pushed through
  // setState at the top of the effect — a synchronous setState there triggers a
  // cascading render on every reload.
  const [result, setResult] = React.useState<{
    nonce: number;
    user: User | null;
    error: ApiError | null;
  } | null>(null);

  // `value` builds its own `reload` from `setNonce` below, so a caller can
  // always trigger a re-read.

  React.useEffect(() => {
    let cancelled = false;

    apiFetch<{ ok: true; user: User }>("/api/auth/me")
      .then(
        (body) => {
          if (cancelled) return;
          setResult({ nonce, user: body.user, error: null });
        },
        (error: unknown) => {
          if (cancelled) return;
          if (error instanceof DOMException && error.name === "AbortError") return;
          setResult({
            nonce,
            user: null,
            error:
              error instanceof ApiError
                ? error
                : new ApiError("server_error", "Could not read your session.", 0),
          });
        },
      );

    return () => {
      cancelled = true;
    };
  }, [nonce]);

  const value = React.useMemo<SessionValue>(() => {
    const reload = () => setNonce((n) => n + 1);
    const settled = result && result.nonce === nonce ? result : null;

    if (settled) {
      // A 401 is a resolved state, not a failure: there is simply no user. The
      // server already revoked the session and cleared the cookie.
      if (settled.error && !settled.error.isUnauthorized) {
        return { user: null, status: "error", error: settled.error, reload };
      }
      return { user: settled.user, status: "ready", error: null, reload };
    }

    // Nothing has settled for this nonce: either the first load, or a
    // revalidation triggered by `reload()`. The two must not look the same.
    // `AppShell` renders a full-page `SessionPending` for `loading`, so falling
    // back to that mid-session would blank the entire app every time someone
    // saved their own name. When the identity is already known, keep rendering
    // it and let the new answer replace it on arrival.
    if (result?.user) {
      return { user: result.user, status: "ready", error: null, reload };
    }

    // No answer for the current nonce yet, including the very first render.
    return { user: null, status: "loading", error: null, reload };
  }, [result, nonce]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

/** Session state. Throws outside the provider — that is a wiring bug, not a state. */
export function useSession(): SessionValue {
  const value = React.useContext(SessionContext);
  if (!value) {
    throw new Error("useSession must be used inside <SessionProvider>.");
  }
  return value;
}

/** Non-throwing variant for components that may render outside the shell. */
export function useSessionOptional(): SessionValue | null {
  return React.useContext(SessionContext);
}

/**
 * The signed-in user, from the real session.
 *
 * This used to live in the mock store and return `seedUsers[0]`, which meant
 * every `PermissionGate` and nav item in the running app was evaluated against a
 * hardcoded person. It reads this provider instead, which fetches
 * `/api/auth/me`.
 *
 * Returns `null` while the session is still loading, so callers must handle the
 * loading state rather than reading `null` as "signed out" — `AppShell` does
 * exactly that.
 */
export function useCurrentUser(): User | null {
  return useSessionOptional()?.user ?? null;
}
