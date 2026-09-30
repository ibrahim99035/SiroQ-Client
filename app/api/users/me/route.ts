import "server-only";

import { NextResponse } from "next/server";
import { z } from "zod";

import { apiError, withErrorHandling } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

/**
 * Self-service profile.
 *
 * Only `name` and `email` are editable here. Role, status, association and
 * pharmacy assignment are deliberately *not* part of this schema: they are
 * tenant-bound and edited through `PATCH /api/users/[id]`, whose guards stop a
 * user from escalating themselves. Exposing them on `/me` would either duplicate
 * those guards or, worse, let a worker promote themselves by choosing the
 * endpoint that was written to be permissive.
 *
 * `.strict()` rejects unknown keys rather than stripping them, so an escalation
 * attempt is answered with a clear 400 instead of a silent no-op that looks
 * like success.
 */
const patchSchema = z
  .object({
    name: z.string().min(1, "Enter a name.").max(120).optional(),
    email: z.string().email("Enter a valid email address.").max(200).optional(),
  })
  .strict();

const profileSelect = {
  id: true,
  email: true,
  name: true,
  role: true,
  status: true,
  associationId: true,
  pharmacyId: true,
  createdAt: true,
} as const;

/** GET /api/users/me — the signed-in user's own record. */
export const GET = withErrorHandling(async () => {
  const user = await requireUser();
  const profile = await prisma.user.findUnique({ where: { id: user.id }, select: profileSelect });
  if (!profile) return apiError("not_found", "That account no longer exists.", 404);
  return NextResponse.json({ ok: true, user: profile });
});

/** PATCH /api/users/me — rename yourself, or change your sign-in email. */
export const PATCH = withErrorHandling(async (request: Request) => {
  const actor = await requireUser();

  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return apiError("invalid", parsed.error.issues[0]?.message ?? "Invalid request.", 400);
  }

  // No-op writes still cost a uniqueness query, so skip when nothing changed.
  if (parsed.data.email && parsed.data.email !== actor.email) {
    const taken = await prisma.user.findUnique({
      where: { email: parsed.data.email },
      select: { id: true },
    });
    if (taken && taken.id !== actor.id) {
      return apiError("conflict", "That email address is already in use.", 409);
    }
  }

  const user = await prisma.user.update({
    where: { id: actor.id },
    data: parsed.data,
    select: profileSelect,
  });

  return NextResponse.json({ ok: true, user });
});
