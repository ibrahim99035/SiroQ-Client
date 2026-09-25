import "server-only";

import { NextResponse } from "next/server";
import { z } from "zod";

import { apiError, withErrorHandling } from "@/lib/api";
import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import { createSession } from "@/lib/session";

const loginSchema = z.object({
  email: z.string().email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password."),
});

/**
 * POST /api/auth/login
 *
 * Always fails with the same generic message so the endpoint cannot be used to
 * discover which email addresses have accounts.
 */
export const POST = withErrorHandling(async (request: Request) => {
  const parsed = loginSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return apiError("invalid", parsed.error.issues[0]?.message ?? "Invalid request.", 400);
  }

  const email = parsed.data.email.toLowerCase().trim();
  const user = await prisma.user.findUnique({ where: { email } });

  const valid = await verifyPassword(parsed.data.password, user?.passwordHash);
  if (!user || !valid) {
    return apiError("unauthorized", "That email and password combination did not match.", 401);
  }

  if (user.status !== "active" || user.disabledAt) {
    return apiError(
      "forbidden",
      "This account is not active. Ask an administrator to re-enable it.",
      403,
    );
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  await createSession(user.id, {
    userAgent: request.headers.get("user-agent"),
    ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
  });

  return NextResponse.json({
    ok: true,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      associationId: user.associationId,
      pharmacyId: user.pharmacyId,
    },
  });
});
