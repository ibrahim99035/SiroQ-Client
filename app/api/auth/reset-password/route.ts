import "server-only";

import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";

import { apiError, withErrorHandling } from "@/lib/api";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/password";

const resetSchema = z.object({
  token: z.string().min(20, "This reset link is not valid."),
  password: z
    .string()
    .min(8, "Use at least 8 characters.")
    .max(200, "That password is too long."),
});

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/**
 * POST /api/auth/reset-password
 *
 * Consumes the single-use token from `/api/auth/forgot-password` and sets the
 * new hash. Every existing session for that user is revoked, so a password
 * change also logs out anyone who had stolen an old session.
 */
export const POST = withErrorHandling(async (request: Request) => {
  const parsed = resetSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return apiError("invalid", parsed.error.issues[0]?.message ?? "Invalid request.", 400);
  }

  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: sha256(parsed.data.token) },
  });

  const invalid = () =>
    apiError("invalid", "This reset link is invalid or has expired. Request a new one.", 400);

  if (!record || record.usedAt || record.expiresAt.getTime() <= Date.now()) {
    return invalid();
  }

  const passwordHash = await hashPassword(parsed.data.password);

  await prisma.$transaction([
    prisma.user.update({ where: { id: record.userId }, data: { passwordHash } }),
    prisma.passwordResetToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    }),
    prisma.session.updateMany({
      where: { userId: record.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);

  return NextResponse.json({ ok: true });
});
