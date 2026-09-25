import "server-only";

import { cache } from "react";

import { readSessionUser, type SessionUser } from "@/lib/session";

/**
 * Current-user accessor for server code.
 *
 * `cache()` dedupes the lookup per request, so a page and three API routes
 * that all ask "who is this?" share one database round trip.
 */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  return readSessionUser();
});

export class AuthError extends Error {
  readonly status: 401 | 403;
  constructor(message: string, status: 401 | 403 = 401) {
    super(message);
    this.name = "AuthError";
    this.status = status;
  }
}

/** Requires a signed-in user. Throws 401 otherwise. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) {
    throw new AuthError("Sign in to continue.", 401);
  }
  return user;
}
