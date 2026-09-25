import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";

import { apiError, withErrorHandling } from "@/lib/api";
import { prisma } from "@/lib/db";

const forgotSchema = z.object({
  email: z.string().email("Enter a valid email address."),
});

const RESET_TTL_MS = 1000 * 60 * 60; // 1 hour

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/**
 * POST /api/auth/forgot-password
 *
 * Always returns the same success response whether or not the address exists,
 * so this endpoint cannot be used to enumerate accounts.
 */
export const POST = withErrorHandling(async (request: Request) => {
  const parsed = forgotSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return apiError("invalid", parsed.error.issues[0]?.message ?? "Invalid request.", 400);
  }

  const email = parsed.data.email.toLowerCase().trim();
  const user = await prisma.user.findUnique({ where: { email } });

  const generic = NextResponse.json({
    ok: true,
    message:
      "If an account exists for that address, a reset link is on its way. The link expires in one hour.",
  });

  if (!user || user.status !== "active" || user.disabledAt) {
    return generic;
  }

  // Invalidate any outstanding reset tokens so only the newest link works.
  await prisma.passwordResetToken.updateMany({
    where: { userId: user.id, usedAt: null },
    data: { usedAt: new Date() },
  });

  const token = randomBytes(32).toString("base64url");
  const tokenHash = sha256(token);

  await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash,
      expiresAt: new Date(Date.now() + RESET_TTL_MS),
    },
  });

  // Delivery is wired in Phase 8.3 (nodemailer + Gmail SMTP). Until then the
  // token is logged in development only, so the flow stays testable.
  if (process.env.NODE_ENV !== "production") {
    console.info(
      `[auth] password reset for ${email}: /reset-password?token=${token} (dev only — wire SMTP in Phase 8.3)`,
    );
  }

  return generic;
});
