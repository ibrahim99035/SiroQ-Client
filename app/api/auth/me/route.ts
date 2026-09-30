import "server-only";

import { NextResponse } from "next/server";

import { withErrorHandling } from "@/lib/api";
import { requireUser } from "@/lib/auth";

/**
 * GET /api/auth/me
 *
 * The single source of truth for "who am I" in the browser.
 *
 * The client used to read this from the Zustand mock store, which returned
 * `seedUsers[0]` — a hardcoded person. Every permission gate in the UI hung off
 * that fake actor, so the interface could render rows the session was never
 * allowed to see. The session cookie is httpOnly, so this route is the only way
 * the client can learn the real user, and the server re-derives scope from the
 * same session on every request regardless of what it answers here.
 *
 * `readSessionUser` already revokes the session and clears the cookie for a
 * disabled, expired, or revoked user, so a 401 from here means "signed out".
 */
export const GET = withErrorHandling(async () => {
  const user = await requireUser();
  return NextResponse.json({ ok: true, user });
});
