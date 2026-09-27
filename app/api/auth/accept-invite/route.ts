import "server-only";

import { NextResponse } from "next/server";
import { z } from "zod";

import { apiError, withErrorHandling } from "@/lib/api";
import { prisma } from "@/lib/db";
import { hashInviteToken, inviteProblem } from "@/lib/invites";
import { hashPassword } from "@/lib/password";
import { createSession } from "@/lib/session";

const acceptSchema = z.object({
  token: z.string().min(20, "This invitation link is not valid."),
  password: z
    .string()
    .min(12, "Use at least 12 characters.")
    .max(200, "That password is too long."),
  confirmPassword: z.string(),
});

/**
 * POST /api/auth/accept-invite
 *
 * Exchanges a single-use invitation token for a password, flips the account to
 * `active`, and signs the user straight in. The token is cleared on success, so
 * the link cannot be replayed even from a browser history entry.
 */
export const POST = withErrorHandling(async (request: Request) => {
  const parsed = acceptSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return apiError("invalid", parsed.error.issues[0]?.message ?? "Invalid request.", 400);
  }

  const { token, password, confirmPassword } = parsed.data;
  if (password !== confirmPassword) {
    return apiError("invalid", "Those passwords do not match.", 400);
  }

  const invite = await prisma.user.findUnique({
    where: { inviteTokenHash: hashInviteToken(token) },
    select: {
      id: true,
      name: true,
      email: true,
      status: true,
      inviteExpiresAt: true,
    },
  });
  if (!invite) {
    return apiError("invalid", "This invitation link is not valid.", 400);
  }

  const problem = inviteProblem(invite);
  if (problem) {
    return apiError("invalid", problem, 400);
  }

  const passwordHash = await hashPassword(password);

  // `updateMany` with the status guard makes acceptance idempotent under a
  // double submit: the second request matches no row and is rejected instead
  // of overwriting the password that was just set.
  const claimed = await prisma.user.updateMany({
    where: { id: invite.id, status: "invited" },
    data: {
      passwordHash,
      status: "active",
      inviteTokenHash: null,
      inviteExpiresAt: null,
      lastLoginAt: new Date(),
    },
  });
  if (claimed.count === 0) {
    return apiError("conflict", "This invitation has already been accepted.", 409);
  }

  await createSession(invite.id, {
    userAgent: request.headers.get("user-agent"),
    ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
  });

  return NextResponse.json({ ok: true, email: invite.email, name: invite.name });
});
