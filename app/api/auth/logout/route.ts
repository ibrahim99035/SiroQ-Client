import "server-only";

import { NextResponse } from "next/server";

import { withErrorHandling } from "@/lib/api";
import { revokeSession } from "@/lib/session";

/** POST /api/auth/logout — revokes the session row and clears the cookie. */
export const POST = withErrorHandling(async () => {
  await revokeSession();
  return NextResponse.json({ ok: true });
});
